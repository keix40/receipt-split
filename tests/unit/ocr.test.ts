import { describe, expect, it } from "vitest";
import { minorUnitDigits, toMinorUnits } from "@/lib/money";
import { normalizeExtraction, validateDraft } from "@/lib/ocr/normalize";
import { parseReceiptText } from "@/lib/ocr/parse-text";
import { receiptExtractionSchema, type ReceiptExtraction } from "@/lib/ocr/schema";

const extraction: ReceiptExtraction = {
  merchant: "Noodle Bar",
  date: "2026-09-20",
  currency: "USD",
  items: [
    { name: "Ramen", quantity: 2, unitPrice: 14, lineTotal: 28 },
    { name: "Gyoza", quantity: 1, unitPrice: null, lineTotal: 7.5 },
  ],
  subtotal: 35.5,
  tax: 3.11,
  tip: 6,
  serviceCharge: null,
  discount: null,
  total: 44.61,
  warnings: [],
};

describe("money", () => {
  it("converts printed decimals to minor units without float drift", () => {
    expect(toMinorUnits(12.5, "USD")).toBe(1250);
    expect(toMinorUnits(1.005, "USD")).toBe(101);
    expect(toMinorUnits(0.1 + 0.2, "USD")).toBe(30);
    expect(minorUnitDigits("JPY")).toBe(0);
    expect(toMinorUnits(1200, "JPY")).toBe(1200);
  });
});

describe("OCR schema + normalization", () => {
  it("accepts a well-formed extraction and rejects a bad currency", () => {
    expect(receiptExtractionSchema.safeParse(extraction).success).toBe(true);
    expect(receiptExtractionSchema.safeParse({ ...extraction, currency: "usd" }).success).toBe(false);
  });

  it("normalizes to cents and finds no issues on a consistent receipt", () => {
    const draft = normalizeExtraction(extraction);
    expect(draft.items.map((i) => i.totalCents)).toEqual([2800, 750]);
    expect(draft.taxCents).toBe(311);
    expect(validateDraft(draft, extraction)).toEqual([]);
  });

  it("accepts a printed total that excludes a hand-written tip", () => {
    const x = { ...extraction, total: 38.61 };
    expect(validateDraft(normalizeExtraction(x), x)).toEqual([]);
  });

  it("flags subtotal and line-math mismatches", () => {
    const x: ReceiptExtraction = {
      ...extraction,
      items: [{ name: "Ramen", quantity: 2, unitPrice: 14, lineTotal: 26 }, extraction.items[1]],
    };
    const codes = validateDraft(normalizeExtraction(x), x).map((i) => i.code);
    expect(codes).toContain("SUBTOTAL_MISMATCH");
    expect(codes).toContain("LINE_MATH");
  });
});

describe("parseReceiptText (Tesseract fallback)", () => {
  it("pulls items and totals out of raw OCR text", () => {
    const text = [
      "THE NOODLE BAR",
      "2026-09-20",
      "2 x Ramen 28.00",
      "Gyoza 7.50",
      "Discount -3.00",
      "Subtotal 32.50",
      "Tax 2.60",
      "Tip 6.00",
      "Total 41.10",
      "VISA 41.10",
    ].join("\n");
    const r = parseReceiptText(text);
    expect(r.merchant).toBe("THE NOODLE BAR");
    expect(r.date).toBe("2026-09-20");
    expect(r.items).toEqual([
      { name: "Ramen", quantity: 2, unitPrice: null, lineTotal: 28 },
      { name: "Gyoza", quantity: 1, unitPrice: null, lineTotal: 7.5 },
    ]);
    expect(r).toMatchObject({ discount: 3, subtotal: 32.5, tax: 2.6, tip: 6, total: 41.1 });
    expect(receiptExtractionSchema.safeParse(r).success).toBe(true);
  });
});
