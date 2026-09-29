import { NextResponse } from "next/server";
import { guardWriteRequest } from "@/lib/api/write-guard";
import { getGroupBundle, recordSettlement } from "@/lib/groups/service";
import { recordSettlementSchema } from "@/lib/receipt/schemas";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const blocked = guardWriteRequest(request, "groups-settlement");
  if (blocked) return blocked;

  const { id: groupId } = await params;
  const parsed = recordSettlementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settlement payload" }, { status: 400 });
  }

  const bundle = await getGroupBundle(groupId);
  if (!bundle) {
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
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ id: result.settlement.id });
}
