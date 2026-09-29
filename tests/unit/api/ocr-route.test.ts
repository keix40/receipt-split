import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ocr/route";
import { _resetRateLimitStoreForTests } from "@/lib/security/rate-limit";

vi.mock("@/lib/ocr", () => ({
  extractReceipt: vi.fn(),
}));

import { extractReceipt } from "@/lib/ocr";

const mockedExtract = vi.mocked(extractReceipt);

afterEach(() => {
  _resetRateLimitStoreForTests();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function ocrRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/ocr", {
    method: "POST",
    headers: {
      host: "app.test",
      origin: "https://app.test",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ocr", () => {
  it("returns 403 without same-origin headers in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(
      new Request("https://app.test/api/ocr", {
        method: "POST",
        headers: { host: "app.test", "content-type": "application/json" },
        body: JSON.stringify({ imageUrl: "https://x.test/a.jpg" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for disallowed blob URL", async () => {
    vi.stubEnv("BLOB_STORE_ID", "mine123");
    const res = await POST(
      ocrRequest({ imageUrl: "https://other.public.blob.vercel-storage.com/a.jpg" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 502 JSON on extraction failure", async () => {
    vi.stubEnv("BLOB_STORE_ID", "mine123");
    mockedExtract.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(
      ocrRequest({
        imageUrl: "https://mine123.public.blob.vercel-storage.com/receipts/a.jpg",
      }),
    );
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("returns 429 when rate limited", async () => {
    vi.stubEnv("BLOB_STORE_ID", "mine123");
    mockedExtract.mockResolvedValue({
      source: "vision",
      extraction: {
        merchant: "X",
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
      },
    });
    const url = "https://mine123.public.blob.vercel-storage.com/r.jpg";
    for (let i = 0; i < 10; i++) {
      await POST(ocrRequest({ imageUrl: url }, { "x-forwarded-for": "1.2.3.4" }));
    }
    const res = await POST(ocrRequest({ imageUrl: url }, { "x-forwarded-for": "1.2.3.4" }));
    expect(res.status).toBe(429);
  });
});
