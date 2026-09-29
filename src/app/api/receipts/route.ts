import { NextResponse } from "next/server";
import { guardWriteRequest } from "@/lib/api/write-guard";
import { saveReceiptSchema } from "@/lib/receipt/schemas";
import { rememberGroupId } from "@/lib/guest/cookies";
import { createReceiptFromDraft } from "@/lib/receipt/service";
import { isAllowedImageUrl } from "@/lib/security/blob-url";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = guardWriteRequest(request, "receipts-create");
  if (blocked) return blocked;

  const parsed = saveReceiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid receipt payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (!isAllowedImageUrl(parsed.data.imageUrl)) {
    return NextResponse.json({ error: "imageUrl must point to this app's Blob store" }, { status: 400 });
  }

  try {
    const receipt = await createReceiptFromDraft(parsed.data);
    await rememberGroupId(receipt.groupId);
    return NextResponse.json({ shareToken: receipt.shareToken, groupId: receipt.groupId });
  } catch (error) {
    console.error("[receipts] create failed", error);
    return NextResponse.json({ error: "Could not save receipt" }, { status: 500 });
  }
}
