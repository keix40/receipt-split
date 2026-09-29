import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { extractReceipt } from "@/lib/ocr";
import { isOcrError } from "@/lib/ocr/errors";
import { normalizeExtraction, validateDraft } from "@/lib/ocr/normalize";
import { ocrRequestSchema } from "@/lib/ocr/schema";
import { withTimeout } from "@/lib/ocr/timeout";
import { isAllowedImageUrl } from "@/lib/security/blob-url";

export const runtime = "nodejs";
export const maxDuration = 60;

const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS ?? 45_000);
const OCR_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(request: Request) {
  const blocked = guardApiRequest(request, "ocr", OCR_RATE_LIMIT);
  if (blocked) return blocked;

  const parsed = ocrRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body must be { imageUrl: string (URL) }" }, { status: 400 });
  }
  const { imageUrl } = parsed.data;
  if (!isAllowedImageUrl(imageUrl)) {
    return NextResponse.json({ error: "imageUrl must point to this app's Blob store" }, { status: 400 });
  }

  try {
    const { source, extraction } = await withTimeout(
      extractReceipt(imageUrl),
      OCR_TIMEOUT_MS,
      "Receipt OCR timed out. Try a smaller or clearer photo.",
    );
    const draft = normalizeExtraction(extraction);
    const issues = validateDraft(draft, extraction);
    return NextResponse.json({ source, imageUrl, draft, issues });
  } catch (error) {
    console.error("[ocr] extraction failed", error);
    if (isOcrError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Could not read this receipt. Try a sharper, well-lit photo." },
      { status: 502 },
    );
  }
}
