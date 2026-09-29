"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { readApiErrorMessage } from "@/lib/api/read-error-response";
import { formatMoney } from "@/lib/money";
import type { ReceiptDraft, ValidationIssue } from "@/lib/ocr/normalize";
import { validateDraft } from "@/lib/ocr/normalize";

type Props = {
  imageUrl: string;
  source: "vision" | "tesseract";
  initialDraft: ReceiptDraft;
  initialIssues: ValidationIssue[];
};

export function ReceiptReviewForm({ imageUrl, source, initialDraft, initialIssues }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issues = useMemo(() => validateDraft(draft), [draft]);
  const displayIssues = issues.length > 0 ? issues : initialIssues;

  const fmt = (c: number) => formatMoney(c, draft.currency);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          merchant: draft.merchant,
          date: draft.date,
          currency: draft.currency,
          items: draft.items,
          subtotalCents: draft.subtotalCents,
          taxCents: draft.taxCents,
          tipCents: draft.tipCents,
          serviceChargeCents: draft.serviceChargeCents,
          discountCents: draft.discountCents,
          totalCents: draft.totalCents,
          ocrSource: source,
          groupName: draft.merchant ?? "Receipt split",
        }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const json = (await res.json()) as { shareToken: string };
      router.push(`/r/${json.shareToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  function updateItem(index: number, patch: Partial<(typeof draft.items)[0]>) {
    setDraft((d) => {
      const items = d.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
      const itemsSum = items.reduce((a, it) => a + it.totalCents, 0);
      return { ...d, items, subtotalCents: itemsSum };
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">
        Review & save{" "}
        <span className="text-sm font-normal text-stone-500">
          via {source === "vision" ? "AI vision" : "offline OCR"}
        </span>
      </h2>

      {displayIssues.length > 0 && (
        <ul className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {displayIssues.map((issue, i) => (
            <li key={i}>⚠ {issue.message}</li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Merchant
        <input
          className="rounded-lg border px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
          value={draft.merchant ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, merchant: e.target.value || null }))}
        />
      </label>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="border-b text-stone-500">
            <tr>
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Cents</th>
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, i) => (
              <tr key={item.position} className="border-b border-stone-100 dark:border-stone-800">
                <td className="py-2">
                  <input
                    className="w-full rounded border px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
                    value={item.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    min={0.001}
                    step={0.001}
                    className="w-20 rounded border px-2 py-1 text-right dark:border-stone-700 dark:bg-stone-900"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    className="w-24 rounded border px-2 py-1 text-right tabular-nums dark:border-stone-700 dark:bg-stone-900"
                    value={item.totalCents}
                    onChange={(e) => updateItem(i, { totalCents: Number(e.target.value) })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["taxCents", "Tax (¢)"],
            ["tipCents", "Tip (¢)"],
            ["serviceChargeCents", "Service (¢)"],
            ["discountCents", "Discount (¢)"],
            ["totalCents", "Total (¢)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            {label}
            <input
              type="number"
              className="rounded-lg border px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
              value={draft[key] ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [key]: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </label>
        ))}
      </div>

      <p className="text-sm text-stone-600 dark:text-stone-400">
        Items subtotal: {fmt(draft.items.reduce((a, it) => a + it.totalCents, 0))}
        {draft.totalCents != null ? ` · Receipt total: ${fmt(draft.totalCents)}` : null}
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        disabled={saving || draft.items.length === 0}
        onClick={() => void save()}
        className="w-fit rounded-lg bg-stone-900 px-5 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-white dark:text-stone-900"
      >
        {saving ? "Saving…" : "Save & split"}
      </button>
    </section>
  );
}
