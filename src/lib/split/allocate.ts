import type { Cents } from "./types";

/**
 * Split an integer amount of cents across weights so that:
 *  1. the parts always sum to exactly `total` (no lost or invented cents),
 *  2. each part is within 1 cent of its exact proportional share,
 *  3. the result is deterministic.
 *
 * Uses the largest-remainder (Hamilton) method: give everyone the floor of
 * their exact share, then hand the leftover cents one at a time to the parts
 * with the largest fractional remainders. Ties go to the lower index.
 *
 * Arithmetic is done with BigInt so large totals × weights stay exact.
 * Negative totals (e.g. discounts) are allocated as the mirror of the positive case.
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`allocate: total must be a safe integer, got ${total}`);
  }
  if (weights.length === 0) {
    throw new RangeError("allocate: weights must not be empty");
  }
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) {
      throw new RangeError(`allocate: weights must be non-negative integers, got ${w}`);
    }
  }
  if (total < 0) return allocate(-total, weights).map((c) => (c === 0 ? 0 : -c));

  const sumW = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (sumW === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw new RangeError("allocate: cannot allocate a non-zero total across zero weights");
  }

  const T = BigInt(total);
  const base: bigint[] = [];
  const rem: bigint[] = [];
  for (const w of weights) {
    const exact = T * BigInt(w);
    base.push(exact / sumW);
    rem.push(exact % sumW);
  }

  let leftover = Number(T - base.reduce((a, b) => a + b, 0n));
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => (rem[b] === rem[a] ? a - b : rem[b] > rem[a] ? 1 : -1));

  for (const i of order) {
    if (leftover === 0) break;
    base[i] += 1n;
    leftover--;
  }
  return base.map(Number);
}

/** Split evenly across `n` parts (first parts get the extra cents). */
export function allocateEvenly(total: Cents, n: number): Cents[] {
  return allocate(total, Array.from({ length: n }, () => 1));
}
