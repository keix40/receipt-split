"use client";

import { useState } from "react";
import { currencyUnitLabel, inputToMinor, minorToInput, minorUnitDigits } from "@/lib/money";

type Props = {
  /** Amount in integer minor units (cents for USD, kyat for MMK). */
  value: number | null;
  currency: string;
  onChange: (minor: number | null) => void;
  className?: string;
  "aria-label"?: string;
  id?: string;
};

/** Money input in major units ("12.50", "8000") that reports integer minor units. */
export function MoneyInput({ value, currency, onChange, className, id, ...rest }: Props) {
  const [text, setText] = useState(() => minorToInput(value, currency));
  const [synced, setSynced] = useState<{ value: number | null; currency: string }>({ value, currency });
  if (synced.value !== value || synced.currency !== currency) {
    // Changed from outside (OCR draft, currency switch, recomputed total).
    setSynced({ value, currency });
    setText(minorToInput(value, currency));
  }
  const digits = minorUnitDigits(currency);
  return (
    <div className={`flex items-center gap-1 rounded border px-2 py-1 dark:border-stone-700 dark:bg-stone-900 ${className ?? ""}`}>
      <span className="text-xs text-stone-500" aria-hidden>
        {currencyUnitLabel(currency)}
      </span>
      <input
        id={id}
        type="text"
        inputMode={digits === 0 ? "numeric" : "decimal"}
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none"
        value={text}
        aria-label={rest["aria-label"]}
        onChange={(e) => {
          const next = e.target.value;
          const minor = inputToMinor(next, currency);
          setText(next);
          setSynced({ value: minor, currency });
          onChange(minor);
        }}
      />
    </div>
  );
}
