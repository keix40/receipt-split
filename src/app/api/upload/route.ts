import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

/**
 * Issues short-lived client-upload tokens for Vercel Blob so images go
 * straight from the phone to Blob storage (bypassing the function body limit).
 * TODO(milestone 2): require an authenticated session in onBeforeGenerateToken.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
        maximumSizeInBytes: 10 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      // Not called on localhost (Blob can't reach your machine); fine for the starter.
      onUploadCompleted: async ({ blob }) => {
        console.info("[upload] stored", blob.pathname);
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
