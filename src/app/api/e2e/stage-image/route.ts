import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { guardWriteRequest } from "@/lib/api/write-guard";
import { newShareToken } from "@/lib/tokens";

export const runtime = "nodejs";

/** Test-only: stage a receipt image on disk and return a localhost URL for OCR. */
export async function POST(request: Request) {
  if (process.env.E2E_TEST !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blocked = guardWriteRequest(request, "e2e-stage");
  if (blocked) return blocked;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const id = newShareToken();
  const dir = path.join(process.cwd(), "public", "e2e-staged");
  await mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, `${id}.png`), buf);

  const port = request.headers.get("host")?.split(":")[1] ?? String(process.env.PORT ?? 3000);
  const imageUrl = `http://127.0.0.1:${port}/e2e-staged/${id}.png`;
  return NextResponse.json({ imageUrl });
}
