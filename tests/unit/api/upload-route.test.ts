import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/upload/route";
import { _resetRateLimitStoreForTests } from "@/lib/security/rate-limit";

vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(async () => ({ type: "blob.generate-client-token", clientToken: "tok" })),
}));

function uploadRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/upload", {
    method: "POST",
    headers: {
      host: "app.test",
      origin: "https://app.test",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

afterEach(() => {
  _resetRateLimitStoreForTests();
  vi.unstubAllEnvs();
});

describe("POST /api/upload", () => {
  it("returns 400 for invalid JSON", async () => {
    const res = await POST(uploadRequest("{not-json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("returns 403 for cross-origin requests in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(
      new Request("https://app.test/api/upload", {
        method: "POST",
        headers: { host: "app.test", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/upload – Blob completion callback", () => {
  it("does not apply the same-origin guard to signed blob.upload-completed callbacks", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(
      new Request("https://app.test/api/upload", {
        method: "POST",
        headers: { host: "app.test", "content-type": "application/json", "x-vercel-signature": "sig" },
        body: JSON.stringify({
          type: "blob.upload-completed",
          payload: { blob: { url: "https://x.public.blob.vercel-storage.com/a.png", pathname: "a.png" }, tokenPayload: null },
        }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("still rejects cross-origin token requests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(
      new Request("https://app.test/api/upload", {
        method: "POST",
        headers: { host: "app.test", "content-type": "application/json" },
        body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "a.png" } }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
