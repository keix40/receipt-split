import { describe, expect, it } from "vitest";
import { parseShareTokenParam, parseUuidParam } from "@/lib/ids";

describe("parseUuidParam", () => {
  it("accepts valid uuids", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseUuidParam(id)).toBe(id);
  });

  it("rejects non-uuid strings", () => {
    expect(parseUuidParam("not-a-uuid")).toBeNull();
    expect(parseUuidParam("")).toBeNull();
  });
});

describe("parseShareTokenParam", () => {
  it("accepts url-safe tokens", () => {
    expect(parseShareTokenParam("AbCd1234_-AbCd1234_-AbCd")).toBe("AbCd1234_-AbCd1234_-AbCd");
  });

  it("rejects short or invalid tokens", () => {
    expect(parseShareTokenParam("short")).toBeNull();
    expect(parseShareTokenParam("has spaces in it!!!!!!")).toBeNull();
  });
});
