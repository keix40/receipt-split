import { NextResponse } from "next/server";
import { guardWriteRequest } from "@/lib/api/write-guard";
import { canRecordSettlement, resolveGroupAccess } from "@/lib/groups/access";
import { getGroupBundle, recordSettlement } from "@/lib/groups/service";
import { getMemberIdForGroup } from "@/lib/guest/cookies";
import { parseUuidParam } from "@/lib/ids";
import { recordSettlementSchema } from "@/lib/receipt/schemas";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: groupId } = await params;
  if (!parseUuidParam(groupId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const blocked = guardWriteRequest(request, "groups-settlement");
  if (blocked) return blocked;

  const parsed = recordSettlementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settlement payload" }, { status: 400 });
  }

  const bundle = await getGroupBundle(groupId);
  if (!bundle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const memberId = await getMemberIdForGroup(groupId);
  const access = resolveGroupAccess(bundle.group, bundle.members, memberId, undefined);
  if (!canRecordSettlement(access)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const result = await recordSettlement(
    groupId,
    parsed.data.fromMemberId,
    parsed.data.toMemberId,
    parsed.data.amountCents,
    bundle.group.currency,
    parsed.data.note,
  );

  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ id: result.settlement.id });
}
