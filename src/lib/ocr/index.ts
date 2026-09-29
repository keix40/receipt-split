import { extractWithTesseract } from "./tesseract";
import { extractWithVision } from "./vision";
import type { ReceiptExtraction } from "./schema";

export type OcrSource = "vision" | "tesseract";

export async function extractReceipt(
  imageUrl: string,
): Promise<{ source: OcrSource; extraction: ReceiptExtraction }> {
  try {
    return { source: "vision", extraction: await extractWithVision(imageUrl) };
  } catch (err) {
    if (process.env.OCR_FALLBACK !== "tesseract") throw err;
    console.warn("[ocr] vision extraction failed, falling back to tesseract:", err);
    return { source: "tesseract", extraction: await extractWithTesseract(imageUrl) };
  }
}
