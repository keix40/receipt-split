import { describe, expect, it } from "vitest";
import { readApiErrorMessage } from "@/lib/api/read-error-response";

describe("readApiErrorMessage", () => {
  it("reads JSON error field", async () => {
    const res = new Response(JSON.stringify({ error: "Bad image" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    expect(await readApiErrorMessage(res)).toBe("Bad image");
  });

  it("handles HTML gateway errors without JSON parse failures", async () => {
    const res = new Response("<html><body>Gateway Timeout</body></html>", {
      status: 504,
      headers: { "content-type": "text/html" },
    });
    expect(await readApiErrorMessage(res)).toContain("timed out");
  });
});
