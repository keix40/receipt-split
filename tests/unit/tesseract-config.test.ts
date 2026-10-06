import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getBundledLangDir, getTesseractWorkerOptions, OCR_LANGS, OCR_PAGE_SEG_MODE, preprocessForOcr } from "@/lib/ocr/tesseract";

describe("tesseract worker options", () => {
  it("passes only string or undefined values to createWorker (no bundled numeric module ids)", () => {
    const opts = getTesseractWorkerOptions();
    for (const [key, value] of Object.entries(opts)) {
      expect(value === undefined || typeof value === "string", `${key} must be string or undefined`).toBe(
        true,
      );
    }
    expect(opts.cachePath).toContain("receipt-split-tesseract");
  });

  it("does not set workerPath or corePath (tesseract.js resolves them; bundled require.resolve is unsafe)", () => {
    const opts = getTesseractWorkerOptions();
    expect("workerPath" in opts).toBe(false);
    expect("corePath" in opts).toBe(false);
  });

  it("reads Myanmar + English, with bundled traineddata", () => {
    expect([...OCR_LANGS]).toEqual(["mya", "eng"]);
    expect(OCR_PAGE_SEG_MODE).toBe("6");
    expect(getTesseractWorkerOptions().langPath).toBe(getBundledLangDir());
  });

  it("falls back to the per-language jsDelivr CDN when bundled data is missing", () => {
    const opts = getTesseractWorkerOptions(path.join(os.tmpdir(), "no-such-tessdata"));
    expect(opts.langPath).toBeUndefined();
  });

  it("downscales large photos to a 2000px long side", async () => {
    const { default: sharp } = await import("sharp");
    const big = await sharp({ create: { width: 3000, height: 4000, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    const meta = await sharp(await preprocessForOcr(big)).metadata();
    expect(meta.height).toBe(2000);
    expect(meta.width).toBe(1500);
    expect(meta.channels).toBe(1);
  });

  it("returns the original bytes if the image can't be decoded", async () => {
    const junk = Buffer.from("not an image");
    expect(await preprocessForOcr(junk)).toBe(junk);
  });
});
