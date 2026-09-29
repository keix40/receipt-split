import { APICallError } from "@ai-sdk/provider";
import { generateText, Output } from "ai";
import { OcrError } from "./errors";
import { receiptExtractionSchema, type ReceiptExtraction } from "./schema";

const SYSTEM_PROMPT = `You extract structured data from photos of restaurant receipts.
Rules:
- Return every purchased line item exactly once, in printed order. Do not invent items.
- Copy amounts exactly as printed (decimals, not cents).
- Modifiers with a price (e.g. "+ extra cheese 1.50") are separate items; free modifiers are ignored.
- Put tax, tip, service charges and receipt-level discounts in their own fields, never in items.
- If something is illegible or cut off, add a short note to "warnings" instead of guessing.`;

function inferImageMediaType(imageUrl: string): string {
  const lower = imageUrl.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

export function classifyVisionError(error: unknown): OcrError | null {
  if (error instanceof APICallError) {
    const body = typeof error.responseBody === "string" ? error.responseBody : "";
    if (
      error.statusCode === 403 &&
      (body.includes("credit card") || body.includes("billing") || body.includes("AI Gateway"))
    ) {
      return new OcrError(
        "Vision OCR is unavailable (AI Gateway billing). Add a payment method in Vercel, or rely on offline OCR if enabled.",
        "BILLING",
      );
    }
  }
  if (error instanceof Error && error.message.includes("OCR_MODEL is not set")) {
    return new OcrError("Vision OCR is not configured (OCR_MODEL).", "UNAVAILABLE");
  }
  return null;
}

/**
 * Vision-LLM OCR via the Vercel AI SDK. The model string is resolved through
 * the Vercel AI Gateway (e.g. "provider/model-name"), so switching providers
 * is a config change. Output is validated against the zod schema by the SDK.
 */
export async function extractWithVision(imageUrl: string): Promise<ReceiptExtraction> {
  const model = process.env.OCR_MODEL;
  if (!model) throw new OcrError("OCR_MODEL is not set", "UNAVAILABLE");

  try {
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
            {
              type: "file",
              mediaType: inferImageMediaType(imageUrl),
              data: { type: "url", url: new URL(imageUrl) },
            },
          ],
        },
      ],
      temperature: 0,
      maxRetries: 2,
    });
    return output;
  } catch (error) {
    const classified = classifyVisionError(error);
    if (classified) throw classified;
    throw error;
  }
}
