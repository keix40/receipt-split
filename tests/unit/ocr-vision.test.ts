import { describe, expect, it } from "vitest";
import { APICallError } from "@ai-sdk/provider";
import { classifyVisionError } from "@/lib/ocr/vision";

describe("classifyVisionError", () => {
  it("detects AI Gateway billing 403", () => {
    const err = new APICallError({
      message: "Forbidden",
      url: "https://gateway.ai.vercel.app",
      requestBodyValues: {},
      statusCode: 403,
      responseHeaders: {},
      responseBody: "requires a valid credit card on file",
      isRetryable: false,
    });
    const classified = classifyVisionError(err);
    expect(classified?.code).toBe("BILLING");
    expect(classified?.message).toMatch(/billing/i);
  });
});
