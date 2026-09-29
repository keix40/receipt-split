import { toMinorUnits } from "@/lib/money";
import type { ReceiptExtraction } from "./schema";

export interface DraftItem {
  position: number;
  name: string;
  quantity: number;
  totalCents: number;
}

export interface ReceiptDraft {
  merchant: string | null;
  date: string | null;
  currency: string;
  items: DraftItem[];
  subtotalCents: number | null;
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
  discountCents: number;
  totalCents: number | null;
}

export type ValidationIssue =
  | { code: "NO_ITEMS"; message: string }
  | { code: "SUBTOTAL_MISMATCH"; message: string; expected: number; actual: number }
  | { code: "TOTAL_MISMATCH"; message: string; expected: number; actual: number }
  | { code: "LINE_MATH"; message: string; position: number }
  | { code: "MODEL_WARNING"; message: string };

/** Convert the model's decimal output into integer minor units. */
export function normalizeExtraction(x: ReceiptExtraction): ReceiptDraft {
  const cur = x.currency.toUpperCase();
  const cents = (v: number | null) => (v == null ? null : toMinorUnits(v, cur));
  return {
    merchant: x.merchant,
    date: x.date,
    currency: cur,
    items: x.items.map((it, i) => ({
      position: i,
      name: it.name.trim(),
      quantity: it.quantity,
      totalCents: toMinorUnits(it.lineTotal, cur),
    })),
    subtotalCents: cents(x.subtotal),
    taxCents: cents(x.tax) ?? 0,
    tipCents: cents(x.tip) ?? 0,
    serviceChargeCents: cents(x.serviceCharge) ?? 0,
    discountCents: Math.abs(cents(x.discount) ?? 0),
    totalCents: cents(x.total),
  };
}

/**
 * Reconcile the numbers. OCR is never trusted blindly: mismatches are
 * surfaced to the user for correction instead of silently "fixed".
 */
export function validateDraft(draft: ReceiptDraft, extraction?: ReceiptExtraction): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const itemsSum = draft.items.reduce((a, it) => a + it.totalCents, 0);

  if (draft.items.length === 0) {
    issues.push({ code: "NO_ITEMS", message: "No line items were detected." });
  }

  if (draft.subtotalCents != null && draft.subtotalCents !== itemsSum) {
    issues.push({
      code: "SUBTOTAL_MISMATCH",
      message: "Line items do not add up to the printed subtotal.",
      expected: draft.subtotalCents,
      actual: itemsSum,
    });
  }

  if (draft.totalCents != null) {
    const base = draft.subtotalCents ?? itemsSum;
    const computed =
      base + draft.taxCents + draft.tipCents + draft.serviceChargeCents - draft.discountCents;
    // A printed total often excludes a hand-written tip, so accept either.
    const withoutTip = computed - draft.tipCents;
    if (draft.totalCents !== computed && draft.totalCents !== withoutTip) {
      issues.push({
        code: "TOTAL_MISMATCH",
        message: "Subtotal + tax + tip + fees − discount does not match the printed total.",
        expected: draft.totalCents,
        actual: computed,
      });
    }
  }

  extraction?.items.forEach((it, i) => {
    if (it.unitPrice != null) {
      const expected = toMinorUnits(it.unitPrice * it.quantity, draft.currency);
      if (Math.abs(expected - draft.items[i].totalCents) > 1) {
        issues.push({
          code: "LINE_MATH",
          message: `"${it.name}": quantity × unit price ≠ line total.`,
          position: i,
        });
      }
    }
  });

  extraction?.warnings.forEach((w) => issues.push({ code: "MODEL_WARNING", message: w }));
  return issues;
}
