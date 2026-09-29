import { z } from "zod";

/**
 * Shape the vision model must return. Amounts are decimals exactly as printed
 * (models read "12.50" more reliably than they convert to cents); we convert
 * to integer minor units in `normalizeExtraction`.
 *
 * Fields use `.nullable()` rather than `.optional()` because strict
 * structured-output modes require every key to be present.
 */
export const receiptLineItemSchema = z.object({
  name: z.string().min(1).describe("Item name as printed, cleaned of codes/SKUs"),
  quantity: z.number().positive().describe("Quantity; use 1 if not printed"),
  unitPrice: z.number().nullable().describe("Price per unit if printed, else null"),
  lineTotal: z
    .number()
    .describe("Total for this line (quantity × unit price) as printed. Negative for discounts/comps on a line."),
});

export const receiptExtractionSchema = z.object({
  merchant: z.string().nullable().describe("Restaurant / merchant name"),
  date: z.string().nullable().describe("Receipt date in ISO 8601 (YYYY-MM-DD) if legible"),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .describe("ISO 4217 currency code, e.g. USD, EUR, JPY. Infer from symbols/locale if needed."),
  items: z.array(receiptLineItemSchema).describe("Every purchased line item, in printed order"),
  subtotal: z.number().nullable().describe("Pre-tax subtotal as printed"),
  tax: z.number().nullable().describe("Total tax (sum of all tax lines)"),
  tip: z.number().nullable().describe("Tip / gratuity if written or printed"),
  serviceCharge: z.number().nullable().describe("Mandatory service charge / fees, not tip"),
  discount: z.number().nullable().describe("Receipt-level discount as a POSITIVE number"),
  total: z.number().nullable().describe("Grand total as printed"),
  warnings: z
    .array(z.string())
    .describe("Anything illegible, cut off, or ambiguous. Empty array if none."),
});

export type ReceiptLineItem = z.infer<typeof receiptLineItemSchema>;
export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

/** Request body for POST /api/ocr */
export const ocrRequestSchema = z.object({
  imageUrl: z.url(),
});
