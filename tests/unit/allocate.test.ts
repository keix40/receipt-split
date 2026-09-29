import { describe, expect, it } from "vitest";
import { allocate, allocateEvenly } from "@/lib/split";

/** Small deterministic PRNG so property-style tests are reproducible. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return (max: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % max;
  };
}

describe("allocate", () => {
  it("splits $1.00 three ways without losing a cent", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("gives leftover cents to the largest remainders", () => {
    // exact shares: 166.67, 333.33, 500.00
    expect(allocate(1000, [1, 2, 3])).toEqual([167, 333, 500]);
  });

  it("mirrors negative totals (discounts)", () => {
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it("gives nothing to zero weights", () => {
    expect(allocate(999, [0, 1, 0, 2])).toEqual([0, 333, 0, 666]);
  });

  it("handles zero totals and rejects impossible splits", () => {
    expect(allocate(0, [0, 0])).toEqual([0, 0]);
    expect(() => allocate(5, [0, 0])).toThrow(RangeError);
    expect(() => allocate(5, [])).toThrow(RangeError);
    expect(() => allocate(1.5, [1])).toThrow(RangeError);
    expect(() => allocate(5, [-1, 2])).toThrow(RangeError);
    expect(() => allocate(5, [0.5, 1])).toThrow(RangeError);
  });

  it("stays exact for very large amounts (BigInt math)", () => {
    const parts = allocate(Number.MAX_SAFE_INTEGER, [3, 7]);
    expect(parts[0] + parts[1]).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("always sums to the total and each part is within 1 cent of exact (property)", () => {
    const rand = lcg(42);
    for (let run = 0; run < 500; run++) {
      const total = rand(200_000) - 50_000;
      const weights = Array.from({ length: 1 + rand(8) }, () => rand(5_000));
      if (!weights.some((w) => w > 0)) weights[0] = 1;
      const parts = allocate(total, weights);
      const sumW = weights.reduce((a, b) => a + b, 0);

      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p, i) => {
        expect(Number.isInteger(p)).toBe(true);
        expect(Math.abs(p - (total * weights[i]) / sumW)).toBeLessThan(1);
      });
    }
  });

  it("allocateEvenly spreads extra cents from the front", () => {
    expect(allocateEvenly(1001, 4)).toEqual([251, 250, 250, 250]);
  });
});
