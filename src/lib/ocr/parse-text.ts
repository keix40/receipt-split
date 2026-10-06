import { minorUnitDigits } from "@/lib/money";
import type { ReceiptExtraction, ReceiptLineItem } from "./schema";

/**
 * Heuristic parser for raw OCR text (Tesseract path). It produces a best-effort draft that
 * the user reviews and corrects; anything it infers or corrects is listed in `warnings`.
 *
 * Handles both decimal currencies ("Burger 12.50") and zero-decimal ones such as Myanmar
 * Kyat ("ထမင်းပေါင်း  1  8,000  8,000", "Total 21,000 Ks"), including the common
 * "qty / unit price / amount" column layout and Myanmar item names.
 */

export const OFFLINE_OCR_NOTE = "Parsed with the offline OCR fallback. Please review every line.";

type TotalKey = "subtotal" | "tax" | "tip" | "serviceCharge" | "discount" | "total";
// Order matters: "Subtotal" must be tested before "Total". Latin patterns tolerate OCR
// dropping the final letter ("Subtota", "Tota").
const TOTAL_KEYS: Array<[TotalKey, RegExp]> = [
  ["subtotal", /\bsub\s*-?\s*t[o0]ta?l?\b|စုစုပေါင်း\s*\(?\s*အခွန်မပါ|ကျသင့်ငွေ\s*စုစုပေါင်း/i],
  ["tax", /\b(tax|vat|gst|hst)\b|အခွန်|ကုန်သွယ်လုပ်ငန်းခွန်/i],
  ["tip", /\b(tip|gratuity)\b/i],
  ["serviceCharge", /\bservice\s*(charge|fee)?\b|\bsvc\b|ဝန်ဆောင်ခ/i],
  ["discount", /\b(discount|promo|coupon)\b|လျှော့/i],
  ["total", /\b(t[o0]ta?l?|grand\s*total|amount\s+due|balance\s+due|net\s+amount)\b|စုစုပေါင်း|ကျသင့်ငွေ/i],
];

/** Payment lines: their amount usually equals the grand total (used to cross-check it). */
const PAYMENT = /\b(visa|mastercard|master|amex|card|kbz\s*pay|kbz|k\s*pay|wave\s*(pay|money)?|aya\s*pay|cb\s*pay|uab\s*pay|mpu|e-?wallet|wallet|account|paid|tender)\b/i;
/** Lines whose amount must never be read as an item or a total. */
const IGNORE = /\b(change|cash|auth|approval)\b|ပြန်အမ်း|ငွေသား/i;
/** Header / meta lines that contain numbers but are not money. */
const META = /\b(bill\s*n[o0]|order|date|time|table|tab|cashier|staff|waiter|server|receipt\s*n[o0]|invoice|inv\s*n[o0]|tel|phone|guest|pax|seat|qty|powered|thank)\b/i;

const MYANMAR_DIGITS = /[၀-၉]/g;
const MYANMAR_CHAR = /[\u1000-\u109F]/g;
const LATIN_CHAR = /[A-Za-z]/g;

function toAsciiDigits(s: string): string {
  return s.replace(MYANMAR_DIGITS, (d) => String(d.charCodeAt(0) - 0x1040));
}

/** Currency detection from the OCR text. Returns null when there is no signal. */
export function detectCurrency(text: string): string | null {
  if (/\b(MMK|kyats?)\b|ကျပ်/i.test(text) || /\d\s*Ks\b/.test(text)) return "MMK";
  if (/\$\s?\d/.test(text)) return "USD";
  if (/€/.test(text)) return "EUR";
  if (/£/.test(text)) return "GBP";
  if (/[¥円]/.test(text)) return "JPY";
  if (/฿/.test(text)) return "THB";
  const mm = (text.match(MYANMAR_CHAR) ?? []).length;
  const latin = (text.match(LATIN_CHAR) ?? []).length;
  if (mm > 0 && mm / (mm + latin) >= 0.15) return "MMK";
  if (/\b(KBZ\s*Pay|KBZ|KPay|Wave\s*Pay|AYA\s*Pay|CB\s*Pay|MPU)\b/i.test(text)) return "MMK";
  return null;
}

/** Normalise OCR noise on the Kyat suffix: "20,000 K:", "1,000K5", "21,000 K" → "… Ks". */
function normalizeKyatSuffix(line: string): string {
  return line.replace(/(\d)\s*[°*]?\s*K(?:s|S|5|:|;|\.|\$)?(?=\s|$)/g, "$1 Ks");
}

interface NumToken {
  raw: string;
  value: number;
  /** Has a thousands/decimal separator (8,000 / 12.50). */
  separated: boolean;
  digits: string;
  negative: boolean;
  hasDecimals: boolean;
}

const NUM_TOKEN = /^([^\d\s]{0,2}?)(\d[\d.,]*\d|\d)([^\d]{0,3})$/;

/**
 * Parse one whitespace-separated token as a money/qty number, tolerating a little junk
 * around it ("E8000", "12.00¢", "1.008°Ks", "$12.50", "-3.00").
 */
export function parseNumberToken(token: string, zeroDecimal: boolean): NumToken | null {
  const t = toAsciiDigits(token);
  const m = t.match(NUM_TOKEN);
  if (!m) return null;
  const [, prefix, core, suffix] = m;
  if (/[:/]/.test(prefix + suffix)) return null; // times, dates, ratios
  const negative = /[-−]/.test(prefix);
  const separated = /[.,]/.test(core);
  let value: number;
  let hasDecimals = false;
  const decimalTail = core.match(/^(.*)[.,](\d{2})$/);
  if (zeroDecimal) {
    // "21,000.00" → 21000; otherwise every separator is a thousands separator
    // ("1.008" → 1008, "8,00" → 800 – a truncated 8,000 is fixed by reconciliation).
    const thousandsWithCents = core.match(/^(\d{1,3}(?:[.,]\d{3})+)[.,]\d{2}$/);
    value = Number((thousandsWithCents ? thousandsWithCents[1] : core).replace(/[.,]/g, ""));
  } else if (decimalTail) {
    hasDecimals = true;
    value = Number(`${decimalTail[1].replace(/[.,]/g, "") || "0"}.${decimalTail[2]}`);
  } else {
    value = Number(core.replace(/[.,]/g, ""));
  }
  if (!Number.isFinite(value)) return null;
  return {
    raw: token,
    value: negative ? -value : value,
    separated,
    digits: String(Math.abs(Math.round(value * (zeroDecimal ? 1 : 100)))),
    negative,
    hasDecimals,
  };
}

/** Token that may sit between/after amounts without ending the number region. */
function isJunkToken(token: string): boolean {
  if (/\d/.test(token)) return false;
  if (/^(ks|kyats?|mmk|usd|\$|€|£|¥)$/i.test(token)) return true;
  return token.length <= 2 || /^[^\p{L}]+$/u.test(token);
}

function letterCount(s: string): number {
  return (s.match(/[\p{L}\u1000-\u109F]/gu) ?? []).length;
}

interface SplitLine {
  label: string;
  numbers: NumToken[];
}

/** Split a line into a text label and its trailing numeric columns. */
function splitLine(line: string, zeroDecimal: boolean): SplitLine {
  const tokens = line.split(/\s+/).filter(Boolean);
  const numbers: NumToken[] = [];
  let i = tokens.length - 1;
  for (; i >= 0; i--) {
    const tok = tokens[i];
    const n = parseNumberToken(tok, zeroDecimal);
    if (n) {
      numbers.unshift(n);
      continue;
    }
    if (isJunkToken(tok)) continue;
    break;
  }
  return { label: tokens.slice(0, i + 1).join(" "), numbers };
}

/** Parse a date and return ISO yyyy-mm-dd. Supports ISO and dd/mm/yyyy (mm/dd for USD when ambiguous). */
export function parseReceiptDate(text: string, currency: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const ascii = toAsciiDigits(text);
  const re = /(?<!\d)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})(?!\d)/g;
  for (const m of ascii.matchAll(re)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let year = Number(m[3]);
    if (m[3].length === 2) year += 2000;
    if (year < 2000 || year > 2100) continue;
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) [day, month] = [a, b];
    else if (b > 12 && a <= 12) [day, month] = [b, a];
    else if (currency === "USD") [month, day] = [a, b];
    else [day, month] = [a, b];
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCMonth() !== month - 1) continue;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

/** OCR dropped trailing digits: "800" for 8000, "12.00¢" for 12,000. */
function isTruncationOf(read: number, actual: number, minLen = 2): boolean {
  const r = String(Math.abs(read));
  const a = String(Math.abs(actual));
  return r.length >= minLen && r.length < a.length && a.startsWith(r);
}

/** Same number of digits, at most one digit misread ("1008" for 1000). */
function isMisreadOf(read: number, actual: number): boolean {
  const r = String(Math.abs(read));
  const a = String(Math.abs(actual));
  if (r.length !== a.length || r === a) return false;
  let diff = 0;
  for (let i = 0; i < r.length; i++) if (r[i] !== a[i]) diff++;
  return diff <= 1;
}

function plausibleOcrError(read: number, actual: number, minLen = 2): boolean {
  return isTruncationOf(read, actual, minLen) || isMisreadOf(read, actual);
}

const fmtNum = (n: number) => n.toLocaleString("en-US");

interface ParseContext {
  zeroDecimal: boolean;
  payments: number[];
}

/**
 * Reconcile the numbers: qty × unit = line, Σ lines = subtotal, subtotal + tax (+ fees) = total.
 * Missing values are inferred when the other two are known. For zero-decimal currencies
 * (where Tesseract noise is common and amounts are large integers), values that look like
 * OCR errors (truncated or one digit off) are corrected when the rest of the receipt
 * corroborates the fix. Every inference/correction is added to `warnings` for review.
 */
export function reconcileExtraction(out: ReceiptExtraction, ctx: ParseContext): ReceiptExtraction {
  const warn = (m: string) => out.warnings.push(m);
  const correct = ctx.zeroDecimal;
  const items = out.items;
  const sum = () => Math.round(items.reduce((a, it) => a + it.lineTotal, 0) * 100) / 100;
  const fees = () => (out.serviceCharge ?? 0) - (out.discount ?? 0);

  // 1. Line math.
  items.forEach((it, i) => {
    if (it.unitPrice == null || it.unitPrice <= 0) {
      it.unitPrice = null;
      return;
    }
    const expected = Math.round(it.quantity * it.unitPrice * 100) / 100;
    if (expected === it.lineTotal || !correct) return;
    if (plausibleOcrError(it.lineTotal, expected)) {
      warn(`Line ${i + 1} "${it.name}": amount read as ${fmtNum(it.lineTotal)}, using ${fmtNum(expected)} (${it.quantity} × ${fmtNum(it.unitPrice)}). Please check.`);
      it.lineTotal = expected;
    } else if (Number.isInteger(it.lineTotal / it.quantity) && plausibleOcrError(it.unitPrice, it.lineTotal / it.quantity)) {
      it.unitPrice = it.lineTotal / it.quantity;
    }
  });

  // 2. Lines vs subtotal: fix a single line whose amount looks like an OCR error of the gap.
  if (correct && out.subtotal != null && items.length > 0 && sum() !== out.subtotal) {
    const s = out.subtotal;
    const candidates = items
      .map((it, i) => ({ it, i, target: s - (sum() - it.lineTotal) }))
      .filter(({ it, target }) => target > 0 && plausibleOcrError(it.lineTotal, target));
    if (candidates.length === 1) {
      const { it, i, target } = candidates[0];
      warn(`Line ${i + 1} "${it.name}": amount read as ${fmtNum(it.lineTotal)}, using ${fmtNum(target)} so the lines add up to the subtotal. Please check.`);
      if (it.unitPrice != null && (it.unitPrice * it.quantity === it.lineTotal || plausibleOcrError(it.unitPrice, target / it.quantity))) {
        it.unitPrice = Number.isInteger(target / it.quantity) ? target / it.quantity : null;
      }
      it.lineTotal = target;
    }
  }

  const base = () => out.subtotal ?? (items.length > 0 ? sum() : null);
  const expectedTotal = () => {
    const b = base();
    return b == null || out.tax == null ? null : b + out.tax + fees();
  };
  const totalMatches = (g: number) => {
    const e = expectedTotal();
    return e != null && (g === e || g === e + (out.tip ?? 0));
  };

  // 3. Total: cross-check with card / e-wallet payment lines.
  let totalCorroborated = false;
  if (out.total != null && ctx.payments.includes(out.total)) totalCorroborated = true;
  if (correct && ctx.payments.length > 0 && (out.total == null || !totalMatches(out.total))) {
    const matching = ctx.payments.find((p) => totalMatches(p));
    const counts = new Map<number, number>();
    for (const p of ctx.payments) counts.set(p, (counts.get(p) ?? 0) + 1);
    const mode = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const b = base();
    const pick =
      matching ??
      (out.total == null || (b != null && out.total < b) || plausibleOcrError(out.total, mode) ? mode : null);
    if (pick != null && pick !== out.total) {
      warn(
        out.total == null
          ? `Total not found; using ${fmtNum(pick)} from the payment line. Please check.`
          : `Total read as ${fmtNum(out.total)}, using ${fmtNum(pick)} from the payment line. Please check.`,
      );
      out.total = pick;
      totalCorroborated = true;
    }
  }

  // 4. Subtotal printed wrong but lines + tax agree with the total.
  if (correct && out.subtotal != null && items.length > 0 && out.subtotal !== sum() && out.total != null && out.tax != null) {
    if (out.total - out.tax - fees() === sum() && plausibleOcrError(out.subtotal, sum(), 1)) {
      warn(`Subtotal read as ${fmtNum(out.subtotal)}, using ${fmtNum(sum())} (sum of lines). Please check.`);
      out.subtotal = sum();
    }
  }

  // 5. Subtotal + tax = total: infer the missing one, or fix an OCR-garbled tax.
  const s = out.subtotal;
  const g = out.total;
  const t = out.tax;
  if (s != null && g != null) {
    const impliedTax = Math.round((g - s - fees()) * 100) / 100;
    const subtotalCorroborated = items.length > 0 && sum() === s;
    if (t == null) {
      if (impliedTax >= 0) {
        out.tax = impliedTax;
        if (impliedTax > 0) warn(`Tax not found; inferred ${fmtNum(impliedTax)} from total − subtotal. Please check.`);
      }
    } else if (
      correct &&
      impliedTax >= 0 &&
      t !== impliedTax &&
      !totalMatches(g) &&
      totalCorroborated &&
      (subtotalCorroborated || isTruncationOf(t, impliedTax, 1)) &&
      plausibleOcrError(t, impliedTax, 1)
    ) {
      warn(`Tax read as ${fmtNum(t)}, using ${fmtNum(impliedTax)} so subtotal + tax = total. Please check.`);
      out.tax = impliedTax;
    }
  } else if (s == null && g != null && t != null) {
    const implied = Math.round((g - t - fees()) * 100) / 100;
    if (implied >= 0) {
      out.subtotal = implied;
      warn(`Subtotal not found; inferred ${fmtNum(implied)} from total − tax. Please check.`);
    }
  } else if (g == null && s != null && t != null) {
    out.total = Math.round((s + t + fees()) * 100) / 100;
    warn(`Total not found; inferred ${fmtNum(out.total)} from subtotal + tax. Please check.`);
  }

  return out;
}

function isPlausibleItemAmount(n: NumToken, zeroDecimal: boolean): boolean {
  if (zeroDecimal) return n.separated || n.digits.length >= 3;
  return n.hasDecimals;
}

function toItem(sl: SplitLine, zeroDecimal: boolean): ReceiptLineItem | null {
  const nums = sl.numbers;
  const amountTok = nums[nums.length - 1];
  if (!amountTok || !isPlausibleItemAmount(amountTok, zeroDecimal)) return null;

  let label = sl.label;
  let quantity: number | null = null;
  let unitPrice: number | null = null;
  const isQty = (n: NumToken) => !n.separated && !n.negative && n.value >= 1 && n.value <= 50 && Number.isInteger(n.value);
  const cols = nums.slice(-3);

  if (cols.length === 3 && isQty(cols[0])) {
    quantity = cols[0].value;
    unitPrice = cols[1].value;
  } else if (cols.length >= 2) {
    const [a] = cols.slice(-2);
    if (isQty(a) && !(zeroDecimal && a.digits.length >= 3)) {
      quantity = a.value;
    } else {
      unitPrice = a.value;
    }
  }

  // Leading row index ("1.", "2)") or quantity ("2 x Ramen", "2 Ramen").
  const lead = label.match(/^[\s|!'"`~.,:;_\-–—()[\]{}]*([0-9၀-၉]{1,3})\s*([.)xX×@])?\s+(.*)$/);
  if (lead) {
    const [, rawN, sep, rest] = lead;
    const n = toAsciiDigits(rawN);
    const marker = sep ?? "";
    if (/[xX×@]/.test(marker) || (marker === "" && nums.length === 1 && quantity == null)) {
      if (quantity == null) quantity = Number(n);
    }
    label = rest;
  }
  label = label
    .replace(/^[\s|!'"`~.,:;_\-–—()[\]{}]+/, "")
    .replace(/[\s|!'"`~.,:;_\-–—()[\]{}]+$/, "")
    .trim();
  if (letterCount(label) < 2) return null;

  if (quantity == null) {
    quantity = 1;
    if (unitPrice != null && unitPrice > 0 && unitPrice !== amountTok.value) {
      const q = amountTok.value / unitPrice;
      const clean = nums.length >= 2 && nums.slice(-2).every((n) => n.separated || n.digits.length >= 4);
      if (clean && Number.isInteger(q) && q >= 1 && q <= 50) quantity = q;
    }
  }
  return { name: label, quantity, unitPrice, lineTotal: amountTok.value };
}

/**
 * @param fallbackCurrency used when the text has no currency signal (symbols, "Ks",
 *   Myanmar script, local wallets…).
 */
export function parseReceiptText(rawText: string, fallbackCurrency = "USD"): ReceiptExtraction {
  const text = rawText.split(/\r?\n/).map(normalizeKyatSuffix).join("\n");
  const currency = detectCurrency(text) ?? fallbackCurrency.toUpperCase();
  const zeroDecimal = minorUnitDigits(currency) === 0;

  const out: ReceiptExtraction = {
    merchant: null,
    date: parseReceiptDate(text, currency),
    currency,
    items: [],
    subtotal: null,
    tax: null,
    tip: null,
    serviceCharge: null,
    discount: null,
    total: null,
    warnings: [OFFLINE_OCR_NOTE],
  };

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const payments: number[] = [];
  let itemsEnded = false;

  for (const line of lines) {
    const sl = splitLine(line, zeroDecimal);
    const key = TOTAL_KEYS.find(([, re]) => re.test(line))?.[0];
    const last = sl.numbers[sl.numbers.length - 1];

    if (out.merchant == null && !key && !META.test(line) && sl.numbers.length === 0) {
      const looksLikeName =
        /[A-Za-z]{3,}/.test(line) || /[\u1000-\u109F]{5,}/.test(line);
      if (looksLikeName && !/^\W*(bill|receipt|invoice|tax\s+invoice)\W*$/i.test(line)) {
        out.merchant = line;
      }
    }

    if (IGNORE.test(line)) continue;
    if (key) {
      if (key === "subtotal" || key === "total") itemsEnded = true;
      if (!last) continue;
      const amount = last.value;
      // First match wins for totals ("Subtotal" appears before "Total").
      if (out[key] == null) out[key] = key === "discount" ? Math.abs(amount) : amount;
      continue;
    }
    if (PAYMENT.test(line)) {
      if (last && last.value > 0) payments.push(Math.abs(last.value));
      continue;
    }
    if (META.test(line) || !last) continue;
    if (itemsEnded) {
      // Unlabelled amounts after the totals block (card / wallet lines whose label OCR lost).
      if (isPlausibleItemAmount(last, zeroDecimal) && last.value > 0) payments.push(last.value);
      continue;
    }
    const item = toItem(sl, zeroDecimal);
    if (item) out.items.push(item);
  }

  return reconcileExtraction(out, { zeroDecimal, payments });
}
