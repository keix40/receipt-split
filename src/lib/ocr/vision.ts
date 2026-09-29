import { generateText, Output } from "ai";
import { receiptExtractionSchema, type ReceiptExtraction } from "./schema";

const SYSTEM_PROMPT = `You extract structured data from photos of restaurant receipts.
Rules:
- Return every purchased line item exactly once, in printed order. Do not invent items.
- Copy amounts exactly as printed (decimals, not cents).
- Modifiers with a price (e.g. "+ extra cheese 1.50") are separate items; free modifiers are ignored.
- Put tax, tip, service charges and receipt-level discounts in their own fields, never in items.
- If something is illegible or cut off, add a short note to "warnings" instead of guessing.`;

/**
 * Vision-LLM OCR via the Vercel AI SDK. The model string is resolved through
 * the Vercel AI Gateway (e.g. "provider/model-name"), so switching providers
 * is a config change. Output is validated against the zod schema by the SDK.
 */
export async function extractWithVision(imageUrl: string): Promise<ReceiptExtraction> {
  const model = process.env.OCR_MODEL;
  if (!model) throw new Error("OCR_MODEL is not set");

  const { output } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    output: Output.object({
      name: "Receipt",
      description: "Line items and totals read from a restaurant receipt",
      schema: receiptExtractionSchema,
    }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract this receipt." },
          { type: "image", image: new URL(imageUrl) },
        ],
      },
    ],
    temperature: 0,
    maxRetries: 2,
  });
  return output;
}
