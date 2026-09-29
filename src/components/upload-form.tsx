"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";
import { formatMoney } from "@/lib/money";
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
      const blob = await upload(`receipts/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });

      setStatus({ kind: "reading" });
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl: blob.url }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `OCR failed (${res.status})`);
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

      {status.kind === "done" && <DraftTable result={status.result} />}
    </div>
  );
}

function DraftTable({ result }: { result: OcrResponse }) {
  const { draft, issues, source } = result;
  const fmt = (c: number) => formatMoney(c, draft.currency);
  const rows: Array<[string, number | null]> = [
    ["Subtotal", draft.subtotalCents],
    ["Tax", draft.taxCents],
    ["Tip", draft.tipCents],
    ["Service charge", draft.serviceChargeCents],
    ["Discount", draft.discountCents ? -draft.discountCents : 0],
    ["Total", draft.totalCents],
  ];

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">
        {draft.merchant ?? "Receipt"}{" "}
        <span className="text-sm font-normal text-stone-500">via {source === "vision" ? "AI vision" : "offline OCR"}</span>
      </h2>

      {issues.length > 0 && (
        <ul className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {issues.map((issue, i) => (
            <li key={i}>⚠ {issue.message}</li>
          ))}
        </ul>
      )}

      <table className="w-full text-left text-sm">
        <thead className="border-b text-stone-500">
          <tr>
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {draft.items.map((item) => (
            <tr key={item.position} className="border-b border-stone-100 dark:border-stone-800">
              <td className="py-2">{item.name}</td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right tabular-nums">{fmt(item.totalCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {rows
            .filter(([, v]) => v != null && v !== 0)
            .map(([label, v]) => (
              <tr key={label}>
                <td className="py-1 text-stone-500" colSpan={2}>
                  {label}
                </td>
                <td className="py-1 text-right tabular-nums">{fmt(v as number)}</td>
              </tr>
            ))}
        </tfoot>
      </table>
      <p className="text-sm text-stone-500">Next step (milestone 2): add friends and tap who had what.</p>
    </section>
  );
}
