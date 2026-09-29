import { afterEach, describe, expect, it, vi } from "vitest";
import { OcrError } from "@/lib/ocr/errors";

vi.mock("@/lib/ocr/vision", () => ({ extractWithVision: vi.fn() }));
vi.mock("@/lib/ocr/tesseract", () => ({ extractWithTesseract: vi.fn() }));

import { extractWithVision } from "@/lib/ocr/vision";
import { extractWithTesseract } from "@/lib/ocr/tesseract";
import { extractReceipt } from "@/lib/ocr";

const vision = vi.mocked(extractWithVision);
const tesseract = vi.mocked(extractWithTesseract);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("extractReceipt", () => {
  it("uses tesseract when vision fails and fallback is enabled", async () => {
    vi.stubEnv("OCR_FALLBACK", "tesseract");
    vision.mockRejectedValueOnce(new Error("gateway down"));
    tesseract.mockResolvedValueOnce({
      merchant: "Cafe",
      date: null,
      currency: "USD",
      items: [],
      subtotal: null,
      tax: null,
      tip: null,
      serviceCharge: null,
      discount: null,
      total: null,
      warnings: [],
    });
    const result = await extractReceipt("https://x.test/a.jpg");
    expect(result.source).toBe("tesseract");
  });

  it("returns a clear error when billing fails and fallback fails", async () => {
    vi.stubEnv("OCR_FALLBACK", "tesseract");
    vision.mockRejectedValueOnce(
      new OcrError("Vision OCR is unavailable (AI Gateway billing).", "BILLING"),
    );
    tesseract.mockRejectedValueOnce(new Error("worker missing"));
    await expect(extractReceipt("https://x.test/a.jpg")).rejects.toMatchObject({
      code: "FALLBACK_FAILED",
    });
  });
});
