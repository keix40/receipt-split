import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OcrError } from "./errors";
import { parseReceiptText } from "./parse-text";
import type { ReceiptExtraction } from "./schema";

/** Myanmar + English: Myanmar receipts mix Burmese item names with Latin labels and digits. */
export const OCR_LANGS = ["mya", "eng"] as const;

/** Long-side cap for OCR input. Phone photos (4000px+) are slower and no more accurate. */
export const OCR_MAX_SIDE = 2000;

/** PSM 6 = "assume a single uniform block of text": keeps receipt rows (name … qty … amount) on one line. */
export const OCR_PAGE_SEG_MODE = "6";

/** Bundled traineddata (see tessdata/README.md); traced into the /api/ocr function. */
export function getBundledLangDir(): string {
  return path.join(process.cwd(), "tessdata");
}

/**
 * Runtime options for tesseract.js on serverless. Worker/core paths are resolved by
 * tesseract.js itself (package is in serverExternalPackages); only cache and lang are overridden.
 *
 * Do not pass workerPath/corePath from require.resolve — in the Vercel/Next bundle,
 * resolve can return numeric module ids and break createWorker.
 *
 * `langPath` points at the bundled `tessdata/` dir when every language file is present.
 * Otherwise it is left undefined so tesseract.js downloads each language from its own
 * jsDelivr package (`@tesseract.js-data/<lang>/4.0.0_best_int`) and caches it in /tmp.
 */
export function getTesseractWorkerOptions(langDir = getBundledLangDir()) {
  const bundled = OCR_LANGS.every((l) => existsSync(path.join(langDir, `${l}.traineddata.gz`)));
  return {
    cachePath: path.join(os.tmpdir(), "receipt-split-tesseract"),
    langPath: bundled ? langDir : undefined,
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
 * Prepare a photo for Tesseract: honour EXIF rotation, flatten transparency onto white,
 * cap the long side at OCR_MAX_SIDE, and keep only the blue channel. Receipt print is
 * black (dark in every channel) while ballpoint pen marks and shop stamps are usually
 * blue (bright in the blue channel), so this drops most scribbles for free.
 * If sharp can't load or decode the image, the original bytes are used.
 */
export async function preprocessForOcr(input: Buffer): Promise<Buffer> {
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(input, { failOn: "none" })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: OCR_MAX_SIDE, height: OCR_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .extractChannel("blue")
      .png()
      .toBuffer();
  } catch (err) {
    console.warn("[ocr] image preprocessing skipped:", (err as Error).message);
    return input;
  }
}

/** Run Tesseract (mya+eng) on an image and return the raw text. */
export async function recognizeReceiptText(input: Buffer): Promise<string> {
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker([...OCR_LANGS], OEM.LSTM_ONLY, getTesseractWorkerOptions());
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: OCR_PAGE_SEG_MODE as never,
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(await preprocessForOcr(input));
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Offline OCR with tesseract.js, then a heuristic parser.
 * Slower and less accurate than a vision model, but free, and keeps the app usable
 * when the model provider is unavailable.
 */
export async function extractWithTesseract(imageUrl: string, currency?: string): Promise<ReceiptExtraction> {
  const text = await recognizeReceiptText(await loadImageBytes(imageUrl));
  return parseReceiptText(text, currency);
}
