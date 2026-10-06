"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { readApiErrorMessage } from "@/lib/api/read-error-response";
import { convertMinorUnits, currencyUnitLabel, formatMoney } from "@/lib/money";
import type { DraftItem, ReceiptDraft, ValidationIssue } from "@/lib/ocr/normalize";
import { validateDraft } from "@/lib/ocr/normalize";
import { OFFLINE_OCR_NOTE } from "@/lib/ocr/parse-text";

type Props = {
  imageUrl: string;
  source: "vision" | "tesseract";
  initialDraft: ReceiptDraft;
  initialIssues: ValidationIssue[];
};

const COMMON_CURRENCIES = ["MMK", "USD", "EUR", "GBP", "JPY", "THB", "SGD"];

type MoneyKey = "taxCents" | "tipCents" | "serviceChargeCents" | "discountCents" | "totalCents";
const MONEY_FIELDS: ReadonlyArray<readonly [MoneyKey, string]> = [
  ["taxCents", "Tax"],
  ["tipCents", "Tip"],
  ["serviceChargeCents", "Service charge"],
  ["discountCents", "Discount"],
  ["totalCents", "Total"],
];

function withSubtotal(d: ReceiptDraft, items: DraftItem[]): ReceiptDraft {
  const positioned = items.map((it, i) => ({ ...it, position: i }));
  return { ...d, items: positioned, subtotalCents: positioned.reduce((a, it) => a + it.totalCents, 0) };
}

export function ReceiptReviewForm({ imageUrl, source, initialDraft, initialIssues }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live checks on the edited draft, plus the OCR's own review notes (corrections it made).
  const liveIssues = useMemo(() => validateDraft(draft), [draft]);
  const ocrNotes = initialIssues.filter((i) => i.code === "MODEL_WARNING" && i.message !== OFFLINE_OCR_NOTE);
  const displayIssues = [...liveIssues.filter((i) => i.code !== "NO_ITEMS"), ...ocrNotes];
  const unit = currencyUnitLabel(draft.currency);
  const fmt = (c: number) => formatMoney(c, draft.currency);
  const currencies = COMMON_CURRENCIES.includes(draft.currency)
    ? COMMON_CURRENCIES
    : [draft.currency, ...COMMON_CURRENCIES];

  const itemsInvalid = draft.items.some((it) => !it.name.trim() || !(it.quantity > 0));
  const canSave = !saving && draft.items.length > 0 && !itemsInvalid;

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
          items: draft.items.map((it) => ({ ...it, name: it.name.trim() })),
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

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setDraft((d) => withSubtotal(d, d.items.map((it, i) => (i === index ? { ...it, ...patch } : it))));
  }

  function addItem() {
    setDraft((d) =>
      withSubtotal(d, [...d.items, { position: d.items.length, name: "", quantity: 1, totalCents: 0 }]),
    );
  }

  function removeItem(index: number) {
    setDraft((d) => withSubtotal(d, d.items.filter((_, i) => i !== index)));
  }

  function changeCurrency(next: string) {
    setDraft((d) => {
      const conv = (v: number) => convertMinorUnits(v, d.currency, next);
      return {
        ...d,
        currency: next,
        items: d.items.map((it) => ({ ...it, totalCents: conv(it.totalCents) })),
        subtotalCents: d.subtotalCents == null ? null : conv(d.subtotalCents),
        taxCents: conv(d.taxCents),
        tipCents: conv(d.tipCents),
        serviceChargeCents: conv(d.serviceChargeCents),
        discountCents: conv(d.discountCents),
        totalCents: d.totalCents == null ? null : conv(d.totalCents),
      };
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
      {source === "tesseract" && (
        <p className="-mt-3 text-xs text-stone-500">Offline OCR can misread blurry text. Check every line.</p>
      )}

      {draft.items.length === 0 && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <p className="font-medium">Couldn&apos;t read items, add them manually.</p>
          <p>Use &ldquo;Add item&rdquo; below for each line on the receipt.</p>
        </div>
      )}

      {displayIssues.length > 0 && (
        <ul
          aria-label="Things to check"
          className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {displayIssues.map((issue, i) => (
            <li key={i}>⚠ {issue.message}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Merchant
          <input
            className="rounded-lg border px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
            value={draft.merchant ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, merchant: e.target.value || null }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Currency
          <select
            aria-label="Currency"
            className="rounded-lg border px-2 py-2 dark:border-stone-700 dark:bg-stone-900"
            value={draft.currency}
            onChange={(e) => changeCurrency(e.target.value)}
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="-mt-2 text-xs text-stone-500" data-testid="detected-currency">
        Detected currency: {initialDraft.currency}
        {draft.date ? ` · Date: ${draft.date}` : null}
      </p>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_3.5rem_7rem_2rem] gap-2 border-b pb-1 text-xs text-stone-500">
          <span>Item</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Amount ({unit})</span>
          <span className="sr-only">Remove</span>
        </div>
        {draft.items.map((item, i) => (
          <div key={item.position} className="grid grid-cols-[1fr_3.5rem_7rem_2rem] items-center gap-2">
            <input
              aria-label={`Item ${i + 1} name`}
              placeholder="Item name"
              className="min-w-0 rounded border px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
              value={item.name}
              onChange={(e) => updateItem(i, { name: e.target.value })}
            />
            <input
              aria-label={`Item ${i + 1} quantity`}
              type="number"
              min={0.001}
              step="any"
              inputMode="decimal"
              className="min-w-0 rounded border px-2 py-1 text-right dark:border-stone-700 dark:bg-stone-900"
              value={item.quantity}
              onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
            />
            <MoneyInput
              aria-label={`Item ${i + 1} amount`}
              currency={draft.currency}
              value={item.totalCents}
              onChange={(v) => updateItem(i, { totalCents: v ?? 0 })}
            />
            <button
              type="button"
              aria-label={`Remove item ${i + 1}`}
              onClick={() => removeItem(i)}
              className="h-8 w-8 rounded text-stone-500 hover:bg-stone-100 hover:text-red-600 dark:hover:bg-stone-800"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="w-fit rounded-lg border border-dashed border-stone-400 px-4 py-2 text-sm font-medium hover:border-stone-700 dark:border-stone-600"
        >
          + Add item
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {MONEY_FIELDS.map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            {label} ({unit})
            <MoneyInput
              currency={draft.currency}
              value={draft[key]}
              className="rounded-lg py-2"
              onChange={(v) =>
                setDraft((d) => ({ ...d, [key]: key === "totalCents" ? v : Math.max(0, v ?? 0) }))
              }
            />
          </label>
        ))}
      </div>

      <p className="text-sm text-stone-600 dark:text-stone-400">
        Items subtotal: {fmt(draft.items.reduce((a, it) => a + it.totalCents, 0))}
        {draft.totalCents != null ? ` · Receipt total: ${fmt(draft.totalCents)}` : null}
      </p>
      <p className="-mt-2 text-xs text-stone-500">Tax, tip and fees are shared in proportion to what each person ordered.</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!canSave && !saving && (
        <p className="text-xs text-stone-500">
          {draft.items.length === 0 ? "Add at least one item to save." : "Every item needs a name and a quantity."}
        </p>
      )}

      <button
        type="button"
        disabled={!canSave}
        onClick={() => void save()}
        className="w-fit rounded-lg bg-stone-900 px-5 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-white dark:text-stone-900"
      >
        {saving ? "Saving…" : "Save & split"}
      </button>
    </section>
  );
}
