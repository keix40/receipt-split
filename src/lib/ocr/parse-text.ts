import type { ReceiptExtraction } from "./schema";

/**
 * Heuristic parser for raw OCR text (Tesseract fallback). Deliberately simple:
 * it produces a best-effort draft that the user reviews and corrects.
 */
// [qty] label [-][$]amount   e.g. "2 x Burger 24.00", "Discount -5.00"
const LINE_RE = /^(?:(\d{1,3})\s*[xX@]?\s+)?(.+?)\s+(-)?\s?[$€£¥]?\s?(\d{1,6}[.,]\d{2})\s*$/;

type TotalKey = "subtotal" | "tax" | "tip" | "serviceCharge" | "discount" | "total";
const TOTAL_KEYS: Array<[TotalKey, RegExp]> = [
  ["subtotal", /\bsub\s*-?\s*total\b/i],
  ["tax", /\b(tax|vat|gst|hst)\b/i],
  ["tip", /\b(tip|gratuity)\b/i],
  ["serviceCharge", /\bservice\s*(charge|fee)\b/i],
  ["discount", /\b(discount|promo|coupon)\b/i],
  ["total", /\b(total|amount\s+due|balance\s+due)\b/i],
];

const IGNORE = /\b(change|cash|visa|mastercard|amex|card|tender|auth|approval)\b/i;

export function parseReceiptText(text: string, currency = "USD"): ReceiptExtraction {
  const out: ReceiptExtraction = {
    merchant: null,
    date: null,
    currency,
    items: [],
    subtotal: null,
    tax: null,
    tip: null,
    serviceCharge: null,
    discount: null,
    total: null,
    warnings: ["Parsed with the offline OCR fallback. Please review every line."],
  };

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  out.merchant = lines.find((l) => /[a-z]/i.test(l) && !LINE_RE.test(l)) ?? null;
  const dateMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (dateMatch) out.date = dateMatch[0];

  for (const line of lines) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, qtyRaw, label, minus, amountRaw] = m;
    const amount = Number(amountRaw.replace(",", ".")) * (minus ? -1 : 1);

    if (IGNORE.test(label)) continue;
    const key = TOTAL_KEYS.find(([, re]) => re.test(label))?.[0];
    if (key) {
      // First match wins for totals ("Subtotal" appears before "Total").
      if (out[key] == null) out[key] = key === "discount" ? Math.abs(amount) : amount;
      continue;
    }
    out.items.push({
      name: label.trim(),
      quantity: qtyRaw ? Number(qtyRaw) : 1,
      unitPrice: null,
      lineTotal: amount,
    });
  }
  return out;
}
