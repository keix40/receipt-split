import { afterEach, describe, expect, it, vi } from "vitest";
import { OcrError } from "@/lib/ocr/errors";

vi.mock("@/lib/ocr/vision", () => ({ extractWithVision: vi.fn() }));
vi.mock("@/lib/ocr/tesseract", () => ({ extractWithTesseract: vi.fn() }));

import { extractWithVision } from "@/lib/ocr/vision";
import { extractWithTesseract } from "@/lib/ocr/tesseract";
import { _resetVisionCooldownForTests, extractReceipt } from "@/lib/ocr";

const vision = vi.mocked(extractWithVision);
const tesseract = vi.mocked(extractWithTesseract);

afterEach(() => {
  vi.resetAllMocks();
  _resetVisionCooldownForTests();
  vi.unstubAllEnvs();
});

describe("extractReceipt", () => {
  it("uses tesseract when vision fails and fallback is enabled", async () => {
    vi.stubEnv("OCR_MODEL", "provider/model");
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
    vi.stubEnv("OCR_MODEL", "provider/model");
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

describe("extractReceipt – optional vision", () => {
  it("skips vision entirely when OCR_MODEL is not set", async () => {
    vi.stubEnv("OCR_MODEL", "");
    tesseract.mockResolvedValueOnce({
      merchant: null, date: null, currency: "MMK", items: [], subtotal: null, tax: null,
      tip: null, serviceCharge: null, discount: null, total: null, warnings: [],
    });
    const result = await extractReceipt("https://x.test/a.jpg");
    expect(vision).not.toHaveBeenCalled();
    expect(result.source).toBe("tesseract");
  });

  it("falls back on a billing error and skips vision on the next request", async () => {
    vi.stubEnv("OCR_MODEL", "provider/model");
    vi.stubEnv("OCR_FALLBACK", "");
    const empty = {
      merchant: null, date: null, currency: "MMK", items: [], subtotal: null, tax: null,
      tip: null, serviceCharge: null, discount: null, total: null, warnings: [],
    };
    vision.mockRejectedValueOnce(new OcrError("requires a valid credit card", "BILLING"));
    tesseract.mockResolvedValue(empty);
    expect((await extractReceipt("https://x.test/a.jpg")).source).toBe("tesseract");
    expect((await extractReceipt("https://x.test/b.jpg")).source).toBe("tesseract");
    expect(vision).toHaveBeenCalledTimes(1);
  });
});
