import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitStoreForTests, checkRateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest } from "@/lib/security/same-origin";
import { getBlobStoreHost, isAllowedImageUrl } from "@/lib/security/blob-url";

afterEach(() => {
  _resetRateLimitStoreForTests();
  vi.unstubAllEnvs();
});

describe("blob URL allowlist", () => {
  it("allows only the configured store host", () => {
    vi.stubEnv("BLOB_STORE_ID", "abc123xyz");
    expect(getBlobStoreHost()).toBe("abc123xyz.public.blob.vercel-storage.com");
    expect(isAllowedImageUrl("https://abc123xyz.public.blob.vercel-storage.com/receipts/x.jpg")).toBe(true);
    expect(isAllowedImageUrl("https://evil.public.blob.vercel-storage.com/receipts/x.jpg")).toBe(false);
    expect(isAllowedImageUrl("http://abc123xyz.public.blob.vercel-storage.com/x.jpg")).toBe(false);
  });

  it("rejects arbitrary blob hosts in production when unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("BLOB_STORE_HOST", "");
    expect(isAllowedImageUrl("https://any.public.blob.vercel-storage.com/x.jpg")).toBe(false);
  });
});

describe("same-origin guard", () => {
  it("accepts matching Origin", () => {
    const req = new Request("https://example.com/api/ocr", {
      method: "POST",
      headers: { host: "example.com", origin: "https://example.com" },
    });
    expect(isSameOriginRequest(req)).toBe(true);
  });

  it("rejects cross-origin requests", () => {
    const req = new Request("https://example.com/api/ocr", {
      method: "POST",
      headers: { host: "example.com", origin: "https://evil.test" },
    });
    expect(isSameOriginRequest(req)).toBe(false);
  });
});

describe("rate limit", () => {
  it("blocks after the limit within the window", () => {
    const cfg = { limit: 2, windowMs: 60_000 };
    expect(checkRateLimit("ip-a", cfg).ok).toBe(true);
    expect(checkRateLimit("ip-a", cfg).ok).toBe(true);
    const blocked = checkRateLimit("ip-a", cfg);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});
