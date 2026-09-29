import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/upload/route";
import { _resetRateLimitStoreForTests } from "@/lib/security/rate-limit";
import { handleUpload } from "@vercel/blob/client";

vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(async () => ({ type: "blob.generate-client-token", clientToken: "tok" })),
}));

const mockedHandleUpload = vi.mocked(handleUpload);

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
  vi.clearAllMocks();
});

describe("POST /api/upload", () => {
  it("returns 400 for invalid JSON", async () => {
    const res = await POST(uploadRequest("{not-json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("returns 403 for cross-origin blob.generate-client-token in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(
      new Request("https://app.test/api/upload", {
        method: "POST",
        headers: { host: "app.test", "content-type": "application/json" },
        body: JSON.stringify({ type: "blob.generate-client-token", payload: {} }),
      }),
    );
    expect(res.status).toBe(403);
    expect(mockedHandleUpload).not.toHaveBeenCalled();
  });

  it("allows blob.upload-completed without Origin (Vercel Blob callback)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockedHandleUpload.mockResolvedValueOnce({ type: "blob.upload-completed", response: "ok" });
    const res = await POST(
      new Request("https://app.test/api/upload", {
        method: "POST",
        headers: { host: "app.test", "content-type": "application/json" },
        body: JSON.stringify({
          type: "blob.upload-completed",
          payload: { pathname: "receipts/x.png" },
        }),
      }),
    );
    expect(res.status).not.toBe(403);
    expect(mockedHandleUpload).toHaveBeenCalled();
  });

  it("allows same-origin blob.generate-client-token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(
      uploadRequest(JSON.stringify({ type: "blob.generate-client-token", payload: {} })),
    );
    expect(res.status).toBe(200);
    expect(mockedHandleUpload).toHaveBeenCalled();
  });
});
