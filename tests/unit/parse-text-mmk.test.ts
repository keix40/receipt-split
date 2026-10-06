import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeExtraction, validateDraft } from "@/lib/ocr/normalize";
import {
  detectCurrency,
  parseNumberToken,
  parseReceiptDate,
  parseReceiptText,
  reconcileExtraction,
} from "@/lib/ocr/parse-text";
import { receiptExtractionSchema, type ReceiptExtraction } from "@/lib/ocr/schema";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests", "fixtures", "ocr", name), "utf8");

describe("Myanmar KBZ Pay bill (real Tesseract mya+eng output)", () => {
  // tests/fixtures/ocr/kbz-bill-mya-eng.txt is the exact text recognizeReceiptText() produced
  // for a CUKCUK POS photo with pen marks and a cut-off right edge.
  const r = parseReceiptText(fixture("kbz-bill-mya-eng.txt"));

  it("detects Kyat and reconciles the totals", () => {
    expect(r.currency).toBe("MMK");
    expect(r).toMatchObject({ subtotal: 20_000, tax: 1_000, total: 21_000 });
    expect(receiptExtractionSchema.safeParse(r).success).toBe(true);
  });

  it("keeps Myanmar item names and the qty / unit / amount columns", () => {
    expect(r.items).toEqual([
      { name: "ထမင်းပေါင်း", quantity: 1, unitPrice: 8_000, lineTotal: 8_000 },
      { name: "မြန်မာထှပင်းပုံစား", quantity: 2, unitPrice: 6_000, lineTotal: 12_000 },
    ]);
  });

  it("flags every value it corrected for review", () => {
    const corrections = r.warnings.filter((w) => w.includes("Please check"));
    expect(corrections.join("\n")).toMatch(/amount read as 1,200, using 12,000/);
    expect(corrections.join("\n")).toMatch(/amount read as 800, using 8,000/);
    expect(corrections.join("\n")).toMatch(/Total read as 8,000, using 21,000/);
    expect(corrections.join("\n")).toMatch(/Tax read as 1,008, using 1,000/);
  });

  it("normalizes to whole kyat with no remaining mismatches", () => {
    const draft = normalizeExtraction(r);
    expect(draft.currency).toBe("MMK");
    expect(draft.items.map((i) => i.totalCents)).toEqual([8_000, 12_000]);
    expect(draft.totalCents).toBe(21_000);
    const codes = validateDraft(draft, r).map((i) => i.code);
    expect(codes).not.toContain("SUBTOTAL_MISMATCH");
    expect(codes).not.toContain("TOTAL_MISMATCH");
    expect(codes).not.toContain("LINE_MATH");
  });
});

describe("noisier grayscale OCR of the same bill", () => {
  const r = parseReceiptText(fixture("kbz-bill-mya-eng-grayscale.txt"));

  it("still gets currency and totals right, and flags the unreadable lines", () => {
    expect(r.currency).toBe("MMK");
    expect(r).toMatchObject({ subtotal: 20_000, tax: 1_000, total: 21_000 });
    const codes = validateDraft(normalizeExtraction(r), r).map((i) => i.code);
    expect(codes).toContain("SUBTOTAL_MISMATCH");
  });
});

describe("currency detection", () => {
  it.each([
    ["Total 21,000 Ks", "MMK"],
    ["Total 21,000 Kyats", "MMK"],
    ["Amount MMK 5,000", "MMK"],
    ["ထမင်းကြော် ၅၀၀၀ ကျပ်", "MMK"],
    ["ထမင်းပေါင်း မြန်မာထမင်း Total 21000", "MMK"],
    ["KBZ Pay 21000", "MMK"],
    ["Burger $12.00", "USD"],
    ["Pizza 9,50 €", "EUR"],
    ["Burger 12.00\nTotal 12.00", null],
  ])("%s → %s", (text, expected) => {
    expect(detectCurrency(text)).toBe(expected);
  });

  it("treats OCR noise like K: / K5 as Kyat", () => {
    expect(parseReceiptText("Subtotal 20,000 K:\nTotal 21,000K5").currency).toBe("MMK");
  });

  it("keeps the fallback currency when there is no signal", () => {
    expect(parseReceiptText("Burger 12.00").currency).toBe("USD");
    expect(parseReceiptText("Burger 12.00", "eur").currency).toBe("EUR");
  });
});

describe("amount tokens", () => {
  it.each([
    ["20,000", true, 20_000],
    ["21.000", true, 21_000],
    ["1.008°Ks", true, 1_008],
    ["E8000", true, 8_000],
    ["21,000.00", true, 21_000],
    ["၂၀,၀၀၀", true, 20_000],
    ["12.50", false, 12.5],
    ["$1,234.56", false, 1_234.56],
    ["7,50", false, 7.5],
    ["-3.00", false, -3],
  ])("%s (zeroDecimal=%s) → %s", (token, zero, value) => {
    expect(parseNumberToken(token, zero)?.value).toBe(value);
  });

  it("rejects times and dates", () => {
    expect(parseNumberToken("11:58", true)).toBeNull();
    expect(parseNumberToken("06/10/2026", true)).toBeNull();
  });
});

describe("dates", () => {
  it("reads dd/mm/yyyy for Kyat receipts and mm/dd/yyyy for ambiguous USD", () => {
    expect(parseReceiptDate("Date: 06/10/2026 (11:58 - 11:58)", "MMK")).toBe("2026-10-06");
    expect(parseReceiptDate("Date: 06/10/2026", "USD")).toBe("2026-06-10");
    expect(parseReceiptDate("25/12/2026", "USD")).toBe("2026-12-25");
    expect(parseReceiptDate("2026-09-20", "MMK")).toBe("2026-09-20");
    expect(parseReceiptDate("31/02/2026", "MMK")).toBeNull();
  });
});

describe("clean Kyat receipt", () => {
  const text = [
    "Shwe Restaurant",
    "Date: 06/10/2026 11:58",
    "Item name Qty. U Amount",
    "1. ထမင်းပေါင်း 1 8,000 8,000",
    "2. မြန်မာထမင်းပွဲ 2 6,000 12,000",
    "Subtotal 20,000 Ks",
    "Tax 1,000 Ks",
    "Total 21,000 Ks",
    "Card/e-wallet account 21,000 Ks",
    "KBZ pay 21,000",
  ].join("\n");

  it("parses without corrections", () => {
    const r = parseReceiptText(text);
    expect(r).toMatchObject({
      merchant: "Shwe Restaurant",
      date: "2026-10-06",
      currency: "MMK",
      subtotal: 20_000,
      tax: 1_000,
      total: 21_000,
    });
    expect(r.items).toEqual([
      { name: "ထမင်းပေါင်း", quantity: 1, unitPrice: 8_000, lineTotal: 8_000 },
      { name: "မြန်မာထမင်းပွဲ", quantity: 2, unitPrice: 6_000, lineTotal: 12_000 },
    ]);
    expect(r.warnings.filter((w) => w.includes("Please check"))).toEqual([]);
  });

  it("reads common Myanmar labels", () => {
    const r = parseReceiptText(
      ["ကော်ဖီ 2 1,500 3,000", "အခွန် 150", "စုစုပေါင်း 3,150"].join("\n"),
    );
    expect(r).toMatchObject({ currency: "MMK", tax: 150, total: 3_150 });
    expect(r.items).toHaveLength(1);
  });
});

describe("reconciliation", () => {
  const base = (over: Partial<ReceiptExtraction>): ReceiptExtraction => ({
    merchant: null,
    date: null,
    currency: "MMK",
    items: [],
    subtotal: null,
    tax: null,
    tip: null,
    serviceCharge: null,
    discount: null,
    total: null,
    warnings: [],
    ...over,
  });
  const ctx = { zeroDecimal: true, payments: [] as number[] };

  it("infers the missing one of subtotal / tax / total", () => {
    expect(reconcileExtraction(base({ subtotal: 20_000, total: 21_000 }), ctx).tax).toBe(1_000);
    expect(reconcileExtraction(base({ tax: 1_000, total: 21_000 }), ctx).subtotal).toBe(20_000);
    expect(reconcileExtraction(base({ subtotal: 20_000, tax: 1_000 }), ctx).total).toBe(21_000);
  });

  it("fixes a truncated line amount using qty × unit", () => {
    const r = reconcileExtraction(
      base({ items: [{ name: "Tea", quantity: 2, unitPrice: 6_000, lineTotal: 1_200 }] }),
      ctx,
    );
    expect(r.items[0].lineTotal).toBe(12_000);
    expect(r.warnings[0]).toMatch(/Please check/);
  });

  it("does not invent fixes for unrelated mismatches; validation flags them", () => {
    const x = base({
      items: [{ name: "Tea", quantity: 2, unitPrice: 6_000, lineTotal: 9_000 }],
      subtotal: 20_000,
      tax: 1_000,
      total: 25_000,
    });
    const r = reconcileExtraction(x, ctx);
    expect(r.items[0].lineTotal).toBe(9_000);
    expect(r.total).toBe(25_000);
    const codes = validateDraft(normalizeExtraction(r), r).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["LINE_MATH", "SUBTOTAL_MISMATCH", "TOTAL_MISMATCH"]));
  });

  it("only infers (never overrides) values for decimal currencies", () => {
    const r = reconcileExtraction(
      base({
        currency: "USD",
        items: [{ name: "Ramen", quantity: 2, unitPrice: 14, lineTotal: 2.8 }],
        subtotal: 28,
        tax: 2.6,
        total: 31.6,
      }),
      { zeroDecimal: false, payments: [31.6] },
    );
    expect(r.items[0].lineTotal).toBe(2.8);
  });
});
