import { NextResponse } from "next/server";
import { getGroupBundle } from "@/lib/groups/service";
import { canRecordSettlement, resolveGroupAccess } from "@/lib/groups/access";
import { getMemberIdForGroup, rememberGroupId } from "@/lib/guest/cookies";
import { parseUuidParam } from "@/lib/ids";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!parseUuidParam(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bundle = await getGroupBundle(id);
  if (!bundle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const memberId = await getMemberIdForGroup(id);
  const access = resolveGroupAccess(bundle.group, bundle.members, memberId, undefined);
  if (!canRecordSettlement(access) && access.kind !== "invite") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await rememberGroupId(id);
  return NextResponse.json({ ok: true });
}
