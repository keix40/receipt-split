import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedImageUrl } from "@/lib/security/blob-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAllowedImageUrl e2e localhost", () => {
  it("allows staged localhost images when E2E_TEST=1", () => {
    vi.stubEnv("E2E_TEST", "1");
    expect(isAllowedImageUrl("http://127.0.0.1:3000/e2e-staged/abc.png")).toBe(true);
    expect(isAllowedImageUrl("http://evil.com/e2e-staged/x.png")).toBe(false);
  });
});
