export type GroupAccess =
  | { kind: "member"; memberId: string }
  | { kind: "invite" }
  | { kind: "denied" };

export function resolveGroupAccess(
  group: { inviteToken: string },
  members: { id: string }[],
  memberIdFromCookie: string | null,
  inviteQuery: string | undefined,
): GroupAccess {
  if (memberIdFromCookie && members.some((m) => m.id === memberIdFromCookie)) {
    return { kind: "member", memberId: memberIdFromCookie };
  }
  if (inviteQuery && inviteQuery === group.inviteToken) {
    return { kind: "invite" };
  }
  return { kind: "denied" };
}

export function canRecordSettlement(access: GroupAccess): access is { kind: "member"; memberId: string } {
  return access.kind === "member";
}
