import os from "node:os";
import path from "node:path";
import { parseReceiptText } from "./parse-text";
import type { ReceiptExtraction } from "./schema";

/**
 * Runtime options for tesseract.js on serverless. Worker/core paths are resolved by
 * tesseract.js itself (package is in serverExternalPackages); only cache and lang are overridden.
 */
export function getTesseractWorkerOptions() {
  return {
    cachePath: path.join(os.tmpdir(), "receipt-split-tesseract"),
    langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int",
  };
}

/**
 * Offline fallback: plain OCR with tesseract.js, then a heuristic parser.
 * Slower and less accurate than the vision model, but has no per-call API cost
 * and keeps the app usable if the model provider is down.
 */
export async function extractWithTesseract(imageUrl: string, currency?: string): Promise<ReceiptExtraction> {
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, getTesseractWorkerOptions());
  try {
    const { data } = await worker.recognize(imageUrl);
    return parseReceiptText(data.text, currency);
  } finally {
    await worker.terminate();
  }
}
