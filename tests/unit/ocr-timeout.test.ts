import { describe, expect, it } from "vitest";
import { OcrError } from "@/lib/ocr/errors";
import { withTimeout } from "@/lib/ocr/timeout";

describe("withTimeout", () => {
  it("rejects with OcrError when the deadline is exceeded", async () => {
    await expect(
      withTimeout(new Promise((resolve) => setTimeout(resolve, 200)), 30, "too slow"),
    ).rejects.toMatchObject({ code: "TIMEOUT", message: "too slow" } satisfies Partial<OcrError>);
  });
});
