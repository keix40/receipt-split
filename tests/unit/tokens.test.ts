import { describe, expect, it } from "vitest";
import { newShareToken } from "@/lib/tokens";

describe("newShareToken", () => {
  it("returns unique url-safe strings", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
