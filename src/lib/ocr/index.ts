import { OcrError } from "./errors";
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
    const useFallback = process.env.OCR_FALLBACK === "tesseract";
    if (!useFallback) {
      if (err instanceof OcrError) throw err;
      throw err;
    }
    console.warn("[ocr] vision extraction failed, falling back to tesseract:", err);
    try {
      return { source: "tesseract", extraction: await extractWithTesseract(imageUrl) };
    } catch (fallbackErr) {
      console.error("[ocr] tesseract fallback failed", fallbackErr);
      if (err instanceof OcrError && err.code === "BILLING") {
        throw new OcrError(
          "Vision OCR is unavailable (AI Gateway billing), and offline OCR also failed. Add a payment method in Vercel or try again later.",
          "FALLBACK_FAILED",
        );
      }
      throw new OcrError(
        "Could not read this receipt with vision or offline OCR. Try a sharper, well-lit photo.",
        "FALLBACK_FAILED",
      );
    }
  }
}
