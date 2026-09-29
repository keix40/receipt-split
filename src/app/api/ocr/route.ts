import { NextResponse } from "next/server";
import { extractReceipt } from "@/lib/ocr";
import { normalizeExtraction, validateDraft } from "@/lib/ocr/normalize";
import { ocrRequestSchema } from "@/lib/ocr/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Only accept images that live in our own Vercel Blob store (prevents SSRF / abuse). */
function isAllowedImageUrl(raw: string): boolean {
  const url = new URL(raw);
  return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
}

export async function POST(request: Request) {
  const parsed = ocrRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body must be { imageUrl: string (URL) }" }, { status: 400 });
  }
  const { imageUrl } = parsed.data;
  if (!isAllowedImageUrl(imageUrl)) {
    return NextResponse.json({ error: "imageUrl must point to this app's Blob store" }, { status: 400 });
  }

  try {
    const { source, extraction } = await extractReceipt(imageUrl);
    const draft = normalizeExtraction(extraction);
    const issues = validateDraft(draft, extraction);
    // TODO(milestone 2): persist to `receipts` / `receipt_items` and return the receipt id.
    return NextResponse.json({ source, imageUrl, draft, issues });
  } catch (error) {
    console.error("[ocr] extraction failed", error);
    return NextResponse.json(
      { error: "Could not read this receipt. Try a sharper, well-lit photo." },
      { status: 502 },
    );
  }
}
