import { describe, expect, it } from "vitest";
import { buildGroupLedger, groupBalancesAndTransfers } from "@/lib/groups/service";

describe("group ledger", () => {
  it("computes net balances and simplified transfers", () => {
    const ledger = buildGroupLedger(
      [{ id: "r1", paidBy: "alex" }],
      [{ receiptId: "r1", memberId: "alex", totalCents: 600 }, { receiptId: "r1", memberId: "sam", totalCents: 400 }],
      [],
    );
    const { net, transfers } = groupBalancesAndTransfers(["alex", "sam"], ledger);
    expect(net.get("alex")).toBe(400);
    expect(net.get("sam")).toBe(-400);
    expect(transfers).toEqual([{ from: "sam", to: "alex", amountCents: 400 }]);
  });
});
