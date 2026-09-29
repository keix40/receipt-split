import { parseReceiptText } from "./parse-text";
import type { ReceiptExtraction } from "./schema";

/**
 * Offline fallback: plain OCR with tesseract.js, then a heuristic parser.
 * Slower and less accurate than the vision model, but has no per-call API cost
 * and keeps the app usable if the model provider is down.
 */
export async function extractWithTesseract(imageUrl: string, currency?: string): Promise<ReceiptExtraction> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(imageUrl);
    return parseReceiptText(data.text, currency);
  } finally {
    await worker.terminate();
  }
}
