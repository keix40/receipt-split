/** Number of minor-unit digits for an ISO 4217 currency (USD → 2, JPY → 0). */
export function minorUnitDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Convert a decimal amount as printed on a receipt (e.g. 12.5) to integer minor units. */
export function toMinorUnits(amount: number, currency: string): number {
  const factor = 10 ** minorUnitDigits(currency);
  // toFixed avoids float artefacts like 1.005 * 100 = 100.49999...
  return Math.round(Number((amount * factor).toFixed(6)));
}

export function formatMoney(cents: number, currency: string, locale?: string): string {
  const factor = 10 ** minorUnitDigits(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / factor);
}

/** Short unit label for money inputs: "Ks" for Kyat, the currency symbol otherwise ("$", "€"). */
export function currencyUnitLabel(currency: string, locale = "en"): string {
  if (currency.toUpperCase() === "MMK") return "Ks";
  try {
    const part = new Intl.NumberFormat(locale, { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Minor units → string for an input field ("1250" USD → "12.50"; "21000" MMK → "21000"). */
export function minorToInput(minor: number | null | undefined, currency: string): string {
  if (minor == null || !Number.isFinite(minor)) return "";
  const digits = minorUnitDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

/** Input string in major units → integer minor units ("12.5" USD → 1250; "21,000" MMK → 21000). */
export function inputToMinor(text: string, currency: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? toMinorUnits(n, currency) : null;
}

/** Re-express a minor-unit amount when the currency changes (keeps the printed number). */
export function convertMinorUnits(minor: number, from: string, to: string): number {
  return Math.round(minor * 10 ** (minorUnitDigits(to) - minorUnitDigits(from)));
}
