import { describe, expect, it } from "vitest";
import { splitReceipt, SplitError, type SplitInput } from "@/lib/split";

const dinner: SplitInput = {
  participants: ["alice", "bob", "cara"],
  items: [
    { id: "burger", totalCents: 1500, shares: [{ participantId: "alice" }] },
    { id: "pasta", totalCents: 1800, shares: [{ participantId: "bob" }] },
    {
      id: "fries",
      totalCents: 600,
      shares: [{ participantId: "alice" }, { participantId: "bob" }, { participantId: "cara" }],
    },
    { id: "wine", totalCents: 3000, shares: [{ participantId: "alice" }, { participantId: "bob" }] },
  ],
  adjustments: [
    { id: "tax", label: "Tax", amountCents: 800 },
    { id: "tip", label: "Tip", amountCents: 1500 },
  ],
};

const byId = (r: ReturnType<typeof splitReceipt>) =>
  Object.fromEntries(r.participants.map((p) => [p.participantId, p]));

describe("splitReceipt", () => {
  it("splits items, then tax and tip proportionally, to the exact cent", () => {
    const r = splitReceipt(dinner);
    const p = byId(r);

    expect(p.alice.itemsCents).toBe(3200); // 1500 + 200 + 1500
    expect(p.bob.itemsCents).toBe(3500); // 1800 + 200 + 1500
    expect(p.cara.itemsCents).toBe(200);

    // tax 800 by 3200:3500:200 → 371.01 / 405.80 / 23.19 → leftover cent to bob
    expect([p.alice, p.bob, p.cara].map((x) => x.adjustments.tax)).toEqual([371, 406, 23]);
    // tip 1500 → 695.65 / 760.87 / 43.48 → leftover cents to bob, then alice
    expect([p.alice, p.bob, p.cara].map((x) => x.adjustments.tip)).toEqual([696, 761, 43]);

    expect([p.alice, p.bob, p.cara].map((x) => x.totalCents)).toEqual([4267, 4667, 266]);
    expect(r.itemsTotalCents).toBe(6900);
    expect(r.adjustmentsTotalCents).toBe(2300);
    expect(r.grandTotalCents).toBe(9200);
  });

  it("totals always equal the receipt (invariant)", () => {
    const r = splitReceipt(dinner);
    expect(r.participants.reduce((a, p) => a + p.totalCents, 0)).toBe(r.grandTotalCents);
  });

  it("is deterministic", () => {
    expect(splitReceipt(dinner)).toEqual(splitReceipt(dinner));
  });

  it("splits a $10 shared item three ways as 3.34 / 3.33 / 3.33", () => {
    const r = splitReceipt({
      participants: ["a", "b", "c"],
      items: [{ id: "pizza", totalCents: 1000, shares: [{ participantId: "a" }, { participantId: "b" }, { participantId: "c" }] }],
    });
    expect(r.participants.map((p) => p.totalCents)).toEqual([334, 333, 333]);
  });

  it("respects weights (2 of 3 portions)", () => {
    const r = splitReceipt({
      participants: ["a", "b"],
      items: [
        { id: "dumplings", totalCents: 900, shares: [{ participantId: "a", weight: 2 }, { participantId: "b", weight: 1 }] },
      ],
    });
    expect(r.participants.map((p) => p.itemsCents)).toEqual([600, 300]);
  });

  it("merges duplicate claims by the same person", () => {
    const r = splitReceipt({
      participants: ["a", "b"],
      items: [{ id: "x", totalCents: 900, shares: [{ participantId: "a" }, { participantId: "a" }, { participantId: "b" }] }],
    });
    expect(r.participants.map((p) => p.itemsCents)).toEqual([600, 300]);
  });

  it("allocates discounts (negative adjustments) proportionally", () => {
    const r = splitReceipt({
      participants: ["a", "b"],
      items: [
        { id: "x", totalCents: 1000, shares: [{ participantId: "a" }] },
        { id: "y", totalCents: 3000, shares: [{ participantId: "b" }] },
      ],
      adjustments: [{ id: "promo", amountCents: -500 }],
    });
    expect(r.participants.map((p) => p.adjustments.promo)).toEqual([-125, -375]);
    expect(r.participants.map((p) => p.totalCents)).toEqual([875, 2625]);
  });

  it("supports equal-split adjustments (e.g. a flat cake-cutting fee)", () => {
    const r = splitReceipt({
      participants: ["a", "b", "c"],
      items: [{ id: "x", totalCents: 3000, shares: [{ participantId: "a" }] }],
      adjustments: [{ id: "fee", amountCents: 100, allocation: "equal" }],
    });
    expect(r.participants.map((p) => p.adjustments.fee)).toEqual([34, 33, 33]);
  });

  it("charges no proportional tax to someone who had nothing", () => {
    const r = splitReceipt({
      participants: ["a", "b"],
      items: [{ id: "x", totalCents: 1000, shares: [{ participantId: "a" }] }],
      adjustments: [{ id: "tax", amountCents: 88 }],
    });
    expect(byId(r).b.totalCents).toBe(0);
    expect(byId(r).a.totalCents).toBe(1088);
  });

  it("falls back to an equal split when there are no item subtotals", () => {
    const r = splitReceipt({
      participants: ["a", "b"],
      items: [],
      adjustments: [{ id: "cover", amountCents: 501 }],
    });
    expect(r.participants.map((p) => p.totalCents)).toEqual([251, 250]);
  });

  it("rejects unclaimed items by default, or splits them equally when asked", () => {
    const input: SplitInput = {
      participants: ["a", "b"],
      items: [{ id: "bread", name: "Bread", totalCents: 301, shares: [] }],
    };
    expect(() => splitReceipt(input)).toThrow(SplitError);
    try {
      splitReceipt(input);
    } catch (e) {
      expect((e as SplitError).code).toBe("UNASSIGNED_ITEM");
    }
    const r = splitReceipt({ ...input, unassigned: "split-equally" });
    expect(r.participants.map((p) => p.totalCents)).toEqual([151, 150]);
  });

  it("validates input", () => {
    expect(() => splitReceipt({ participants: [], items: [] })).toThrow(/participant/);
    expect(() => splitReceipt({ participants: ["a", "a"], items: [] })).toThrow(/Duplicate/);
    expect(() =>
      splitReceipt({ participants: ["a"], items: [{ id: "x", totalCents: 100, shares: [{ participantId: "z" }] }] }),
    ).toThrow(/unknown participant/);
    expect(() =>
      splitReceipt({ participants: ["a"], items: [{ id: "x", totalCents: 1.5, shares: [{ participantId: "a" }] }] }),
    ).toThrow(/integer/);
    expect(() =>
      splitReceipt({
        participants: ["a"],
        items: [{ id: "x", totalCents: 100, shares: [{ participantId: "a", weight: -1 }] }],
      }),
    ).toThrow(/weight/);
  });

  it("preserves the grand total across many random receipts (property)", () => {
    let seed = 7;
    const rand = (max: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % max;
    };
    for (let run = 0; run < 300; run++) {
      const participants = Array.from({ length: 1 + rand(6) }, (_, i) => `p${i}`);
      const items = Array.from({ length: 1 + rand(10) }, (_, i) => {
        const claimers = participants.filter(() => rand(2) === 1);
        const shares = (claimers.length ? claimers : [participants[0]]).map((participantId) => ({
          participantId,
          weight: 1 + rand(3),
        }));
        return { id: `i${i}`, totalCents: rand(10_000), shares };
      });
      const r = splitReceipt({
        participants,
        items,
        adjustments: [
          { id: "tax", amountCents: rand(2_000) },
          { id: "tip", amountCents: rand(3_000) },
          { id: "discount", amountCents: -rand(500) },
        ],
      });
      expect(r.participants.reduce((a, p) => a + p.totalCents, 0)).toBe(r.grandTotalCents);
    }
  });
});
