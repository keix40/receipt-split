import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OcrError } from "./errors";
import { parseReceiptText } from "./parse-text";
import type { ReceiptExtraction } from "./schema";

/**
 * Runtime options for tesseract.js on serverless. Worker/core paths are resolved by
 * tesseract.js itself (package is in serverExternalPackages); only cache and lang are overridden.
 *
 * Do not pass workerPath/corePath from require.resolve — in the Vercel/Next bundle,
 * resolve can return numeric module ids and break createWorker.
 */
export function getTesseractWorkerOptions() {
  return {
    cachePath: path.join(os.tmpdir(), "receipt-split-tesseract"),
    langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int",
  };
}

async function loadImageBytes(imageUrl: string): Promise<Buffer> {
  if (!/^https?:\/\//i.test(imageUrl)) {
    return readFile(imageUrl);
  }
  const url = new URL(imageUrl);
  if (process.env.E2E_TEST === "1" && url.pathname.startsWith("/e2e-staged/")) {
    const filePath = path.join(process.cwd(), "public", url.pathname);
    return readFile(filePath);
  }
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new OcrError("Could not download the receipt image for offline OCR.", "UNAVAILABLE");
  }
  return Buffer.from(await res.arrayBuffer());
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
    const input = await loadImageBytes(imageUrl);
    const { data } = await worker.recognize(input);
    return parseReceiptText(data.text, currency);
  } finally {
    await worker.terminate();
  }
}
