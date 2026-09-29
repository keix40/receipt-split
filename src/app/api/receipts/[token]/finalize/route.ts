import { NextResponse } from "next/server";
import { guardWriteRequest } from "@/lib/api/write-guard";
import { finalizeReceiptSchema } from "@/lib/receipt/schemas";
import { finalizeReceipt } from "@/lib/receipt/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Params) {
  const blocked = guardWriteRequest(request, "receipts-finalize");
  if (blocked) return blocked;

  const { token } = await params;
  const parsed = finalizeReceiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "paidByMemberId is required" }, { status: 400 });
  }

  const result = await finalizeReceipt(token, parsed.data.paidByMemberId);
  if ("error" in result) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "finalized"
          ? 409
          : result.error === "unassigned_items"
            ? 422
            : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
