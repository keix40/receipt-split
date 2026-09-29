import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { parseReceiptText } from "./parse-text";
import type { ReceiptExtraction } from "./schema";

const require = createRequire(import.meta.url);

/** Paths and cache locations that work when tesseract.js is traced into the serverless bundle. */
export function getTesseractWorkerOptions() {
  const pkgRoot = path.dirname(require.resolve("tesseract.js/package.json"));
  const cachePath = path.join(os.tmpdir(), "receipt-split-tesseract");
  return {
    workerPath: path.join(pkgRoot, "src/worker-script/node/index.js"),
    corePath: require.resolve("tesseract.js-core/tesseract-core-lstm.wasm.js"),
    cachePath,
    langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int",
    workerBlobURL: false as const,
    gzip: true as const,
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
