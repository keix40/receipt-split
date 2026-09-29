"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";
import { readApiErrorMessage } from "@/lib/api/read-error-response";
import { ReceiptReviewForm } from "@/components/receipt-review-form";
import type { ReceiptDraft, ValidationIssue } from "@/lib/ocr/normalize";

type OcrResponse = {
  source: "vision" | "tesseract";
  imageUrl: string;
  draft: ReceiptDraft;
  issues: ValidationIssue[];
};

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "reading" }
  | { kind: "done"; result: OcrResponse }
  | { kind: "error"; message: string };

const MAX_BYTES = 10 * 1024 * 1024;

export function UploadForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setStatus({ kind: "error", message: "Please choose an image file." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({ kind: "error", message: "Image is larger than 10 MB." });
      return;
    }
    setPreview(URL.createObjectURL(file));

    try {
      setStatus({ kind: "uploading" });
      let imageUrl: string;
      const stageBody = new FormData();
      stageBody.set("file", file);
      const staged = await fetch("/api/e2e/stage-image", { method: "POST", body: stageBody });
      if (staged.ok) {
        imageUrl = ((await staged.json()) as { imageUrl: string }).imageUrl;
      } else if (staged.status === 404) {
        const blob = await upload(`receipts/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });
        imageUrl = blob.url;
      } else {
        throw new Error(await readApiErrorMessage(staged));
      }

      setStatus({ kind: "reading" });
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res));
      }
      setStatus({ kind: "done", result: (await res.json()) as OcrResponse });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong" });
    }
  }

  const busy = status.kind === "uploading" || status.kind === "reading";

  return (
    <div className="flex flex-col gap-6">
      <label
        htmlFor="receipt"
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-stone-300 p-8 text-center hover:border-stone-500 dark:border-stone-700"
      >
        <span className="font-medium">{busy ? "Working…" : "Tap to take a photo or choose an image"}</span>
        <span className="text-sm text-stone-500">JPEG, PNG, WebP or HEIC · up to 10 MB</span>
        <input
          id="receipt"
          name="receipt"
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>

      <p role="status" aria-live="polite" className="text-sm text-stone-600 dark:text-stone-400">
        {status.kind === "uploading" && "Uploading image…"}
        {status.kind === "reading" && "Reading line items…"}
        {status.kind === "error" && <span className="text-red-600">{status.message}</span>}
      </p>

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img src={preview} alt="Receipt preview" className="max-h-80 w-fit rounded-lg border object-contain" />
      )}

      {status.kind === "done" && (
        <ReceiptReviewForm
          imageUrl={status.result.imageUrl}
          source={status.result.source}
          initialDraft={status.result.draft}
          initialIssues={status.result.issues}
        />
      )}
    </div>
  );
}
