import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";

const UPLOAD_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/**
 * Issues short-lived client-upload tokens for Vercel Blob so images go
 * straight from the phone to Blob storage (bypassing the function body limit).
 * TODO(milestone 2): require an authenticated session in onBeforeGenerateToken.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only the browser's token request is same-origin. The `blob.upload-completed` callback
  // comes server-to-server from Vercel Blob with no Origin/Referer; handleUpload verifies
  // its signature instead, so the same-origin guard must not run for it (it returned 403).
  if (body?.type !== "blob.upload-completed") {
    const blocked = guardApiRequest(request, "upload", UPLOAD_RATE_LIMIT);
    if (blocked) return blocked;
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        maximumSizeInBytes: 10 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async ({ blob }) => {
        console.info("[upload] stored", blob.pathname);
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
