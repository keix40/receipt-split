import { splitReceipt } from "@/lib/split";
import type { Adjustment, SplitInput, SplitItem } from "@/lib/split/types";

export interface ReceiptSplitRow {
  itemId: string;
  itemName: string;
  totalCents: number;
  claims: { memberId: string; weight: number }[];
}

export interface ReceiptAdjustments {
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
  discountCents: number;
}

export function buildSplitInput(
  memberIds: string[],
  items: ReceiptSplitRow[],
  adj: ReceiptAdjustments,
  unassigned: "error" | "split-equally" = "error",
): SplitInput {
  const splitItems: SplitItem[] = items.map((it) => ({
    id: it.itemId,
    name: it.itemName,
    totalCents: it.totalCents,
    shares: it.claims.map((c) => ({ participantId: c.memberId, weight: c.weight })),
  }));

  const adjustments: Adjustment[] = [
    { id: "tax", label: "Tax", amountCents: adj.taxCents },
    { id: "tip", label: "Tip", amountCents: adj.tipCents },
    { id: "service", label: "Service charge", amountCents: adj.serviceChargeCents },
    { id: "discount", label: "Discount", amountCents: -adj.discountCents },
  ].filter((a) => a.amountCents !== 0);

  return {
    participants: memberIds,
    items: splitItems,
    adjustments,
    unassigned,
  };
}

export function computeLiveSplit(
  memberIds: string[],
  items: ReceiptSplitRow[],
  adj: ReceiptAdjustments,
) {
  if (memberIds.length === 0) {
    return null;
  }
  return splitReceipt(buildSplitInput(memberIds, items, adj, "split-equally"));
}
