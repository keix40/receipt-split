import { NextResponse } from "next/server";
import { guardWriteRequest } from "@/lib/api/write-guard";
import { createGroupSchema } from "@/lib/receipt/schemas";
import { createGroup } from "@/lib/groups/service";
import { rememberGroupId, setMemberForGroup } from "@/lib/guest/cookies";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = guardWriteRequest(request, "groups-create");
  if (blocked) return blocked;

  const parsed = createGroupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid group payload" }, { status: 400 });
  }

  try {
    const { group, memberId } = await createGroup(parsed.data.name, parsed.data.currency);
    await setMemberForGroup(group.id, memberId);
    await rememberGroupId(group.id);
    return NextResponse.json({ id: group.id, inviteToken: group.inviteToken });
  } catch (error) {
    console.error("[groups] create failed", error);
    return NextResponse.json({ error: "Could not create group" }, { status: 500 });
  }
}
