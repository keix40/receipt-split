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
