import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { getTesseractWorkerOptions } from "@/lib/ocr/tesseract";

describe("tesseract worker options", () => {
  it("points worker and core paths at installed packages", () => {
    const opts = getTesseractWorkerOptions();
    expect(fs.existsSync(opts.workerPath)).toBe(true);
    expect(fs.existsSync(opts.corePath)).toBe(true);
    expect(opts.cachePath).toContain("receipt-split-tesseract");
    expect(opts.workerBlobURL).toBe(false);
  });
});
