import { OcrError } from "./errors";
import { extractWithTesseract } from "./tesseract";
import { extractWithVision } from "./vision";
import type { ReceiptExtraction } from "./schema";

export type OcrSource = "vision" | "tesseract";

/** After a billing/config failure, skip the vision call for a while (per serverless instance). */
const VISION_COOLDOWN_MS = 10 * 60_000;
let visionUnavailableUntil = 0;

/** Test hook. */
export function _resetVisionCooldownForTests(): void {
  visionUnavailableUntil = 0;
}

function visionEnabled(): boolean {
  if (!process.env.OCR_MODEL || process.env.OCR_VISION === "off") return false;
  return Date.now() >= visionUnavailableUntil;
}

/**
 * AI vision is optional: it is tried only when OCR_MODEL is set and hasn't recently failed
 * with a billing/config error. Otherwise (or when vision fails and OCR_FALLBACK=tesseract,
 * or vision is simply unavailable) the free offline Tesseract path is used.
 */
export async function extractReceipt(
  imageUrl: string,
): Promise<{ source: OcrSource; extraction: ReceiptExtraction }> {
  let visionError: unknown = null;
  if (visionEnabled()) {
    try {
      return { source: "vision", extraction: await extractWithVision(imageUrl) };
    } catch (err) {
      visionError = err;
      const unavailable = err instanceof OcrError && (err.code === "BILLING" || err.code === "UNAVAILABLE");
      if (unavailable) visionUnavailableUntil = Date.now() + VISION_COOLDOWN_MS;
      if (process.env.OCR_FALLBACK !== "tesseract" && !unavailable) throw err;
      console.warn("[ocr] vision unavailable, using tesseract:", (err as Error).message);
    }
  }

  try {
    return { source: "tesseract", extraction: await extractWithTesseract(imageUrl) };
  } catch (fallbackErr) {
    console.error("[ocr] tesseract failed", fallbackErr);
    if (visionError instanceof OcrError && visionError.code === "BILLING") {
      throw new OcrError(
        "Vision OCR is unavailable (AI Gateway billing), and offline OCR also failed. Try again later.",
        "FALLBACK_FAILED",
      );
    }
    throw new OcrError(
      "Could not read this receipt with offline OCR. Try a sharper, well-lit photo.",
      "FALLBACK_FAILED",
    );
  }
}
