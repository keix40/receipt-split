import { NextResponse } from "next/server";
import { guardWriteRequest } from "@/lib/api/write-guard";
import { getMemberIdForReceipt } from "@/lib/guest/cookies";
import { claimItemSchema } from "@/lib/receipt/schemas";
import { mutateClaim } from "@/lib/receipt/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Params) {
  const blocked = guardWriteRequest(request, "receipts-claims");
  if (blocked) return blocked;

  const { token } = await params;
  const memberId = await getMemberIdForReceipt(token);
  if (!memberId) {
    return NextResponse.json({ error: "join_first" }, { status: 401 });
  }

  const parsed = claimItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid claim payload" }, { status: 400 });
  }

  const { itemId, action, weight } = parsed.data;
  const result = await mutateClaim(token, memberId, itemId, action, weight);
  if ("error" in result) {
    const status =
      result.error === "not_found" ? 404 : result.error === "finalized" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
