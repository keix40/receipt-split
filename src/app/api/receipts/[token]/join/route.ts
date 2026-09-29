import { NextResponse } from "next/server";
import { guardWriteRequest } from "@/lib/api/write-guard";
import { joinReceiptSchema } from "@/lib/receipt/schemas";
import { rememberGroupId } from "@/lib/guest/cookies";
import { parseShareTokenParam } from "@/lib/ids";
import { joinReceiptAsGuest } from "@/lib/receipt/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Params) {
  const blocked = guardWriteRequest(request, "receipts-join");
  if (blocked) return blocked;

  const { token } = await params;
  if (!parseShareTokenParam(token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = joinReceiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const result = await joinReceiptAsGuest(token, parsed.data.displayName);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  await rememberGroupId(result.groupId);
  return NextResponse.json({ memberId: result.memberId });
}
