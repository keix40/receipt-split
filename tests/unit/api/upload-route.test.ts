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
