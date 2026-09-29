import { describe, expect, it } from "vitest";
import { buildSplitInput, computeLiveSplit } from "@/lib/receipt/split-from-db";
import { splitReceipt } from "@/lib/split";

describe("receipt split from db rows", () => {
  it("allocates tax and tip proportionally with exact total", () => {
    const memberIds = ["a", "b"];
    const items = [
      {
        itemId: "i1",
        itemName: "Burger",
        totalCents: 1200,
        claims: [{ memberId: "a", weight: 1 }],
      },
      {
        itemId: "i2",
        itemName: "Fries",
        totalCents: 400,
        claims: [{ memberId: "b", weight: 1 }],
      },
    ];
    const result = splitReceipt(
      buildSplitInput(memberIds, items, { taxCents: 128, tipCents: 300, serviceChargeCents: 0, discountCents: 0 }),
    );
    expect(result.grandTotalCents).toBe(2028);
    expect(result.participants.reduce((s, p) => s + p.totalCents, 0)).toBe(2028);
  });

  it("preview splits unclaimed items evenly among participants", () => {
    const preview = computeLiveSplit(
      ["a", "b"],
      [{ itemId: "i1", itemName: "Shared", totalCents: 1000, claims: [] }],
      { taxCents: 0, tipCents: 0, serviceChargeCents: 0, discountCents: 0 },
    );
    expect(preview?.participants.map((p) => p.itemsCents)).toEqual([500, 500]);
  });
});
