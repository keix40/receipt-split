import { describe, expect, it } from "vitest";
import { canRecordSettlement, resolveGroupAccess } from "@/lib/groups/access";

const group = { inviteToken: "abc123inviteToken4567890" };
const members = [{ id: "11111111-1111-4111-8111-111111111111" }];

describe("resolveGroupAccess", () => {
  it("allows members with a matching cookie id", () => {
    const access = resolveGroupAccess(group, members, members[0]!.id, undefined);
    expect(access).toEqual({ kind: "member", memberId: members[0]!.id });
    expect(canRecordSettlement(access)).toBe(true);
  });

  it("allows view-only access with a valid invite query", () => {
    const access = resolveGroupAccess(group, members, null, group.inviteToken);
    expect(access).toEqual({ kind: "invite" });
    expect(canRecordSettlement(access)).toBe(false);
  });

  it("denies uuid-only access without membership or invite", () => {
    const access = resolveGroupAccess(group, members, null, undefined);
    expect(access).toEqual({ kind: "denied" });
  });

  it("denies wrong invite token", () => {
    const access = resolveGroupAccess(group, members, null, "wrong-token");
    expect(access).toEqual({ kind: "denied" });
  });
});
