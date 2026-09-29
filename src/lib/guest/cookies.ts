import { cookies } from "next/headers";

const GROUPS_COOKIE = "rs_groups";
const MEMBER_PREFIX = "rs_member_";

export async function getMemberIdForReceipt(shareToken: string): Promise<string | null> {
  const jar = await cookies();
  return jar.get(`${MEMBER_PREFIX}${shareToken}`)?.value ?? null;
}

export async function setMemberForReceipt(shareToken: string, memberId: string): Promise<void> {
  const jar = await cookies();
  jar.set(`${MEMBER_PREFIX}${shareToken}`, memberId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function getKnownGroupIds(): Promise<string[]> {
  const jar = await cookies();
  const raw = jar.get(GROUPS_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export async function rememberGroupId(groupId: string): Promise<void> {
  const jar = await cookies();
  const existing = await getKnownGroupIds();
  if (existing.includes(groupId)) return;
  const next = [...existing, groupId];
  jar.set(GROUPS_COOKIE, JSON.stringify(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
