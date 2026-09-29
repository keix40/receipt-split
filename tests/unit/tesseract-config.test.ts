import { describe, expect, it } from "vitest";
import { getTesseractWorkerOptions } from "@/lib/ocr/tesseract";

describe("tesseract worker options", () => {
  it("passes only string or undefined values to createWorker (no bundled numeric module ids)", () => {
    const opts = getTesseractWorkerOptions();
    for (const [key, value] of Object.entries(opts)) {
      expect(value === undefined || typeof value === "string", `${key} must be string or undefined`).toBe(
        true,
      );
    }
    expect(opts.cachePath).toContain("receipt-split-tesseract");
    expect(opts.langPath).toMatch(/^https:\/\//);
  });
});
