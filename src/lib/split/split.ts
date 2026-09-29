import { allocate, allocateEvenly } from "./allocate";
import {
  SplitError,
  type Cents,
  type ParticipantSplit,
  type SplitInput,
  type SplitResult,
} from "./types";

/**
 * Pure, deterministic receipt split.
 *
 * 1. Each item's total is divided among the people who claimed it, by weight
 *    (largest-remainder rounding, so the item total is preserved exactly).
 * 2. Each person's item subtotal is summed.
 * 3. Each adjustment (tax, tip, fees, discounts) is divided either in
 *    proportion to item subtotals or equally, again with exact rounding.
 * 4. Person total = item subtotal + their adjustment shares.
 *
 * Invariant: sum(person totals) === sum(items) + sum(adjustments).
 */
export function splitReceipt(input: SplitInput): SplitResult {
  const { participants, items, adjustments = [], unassigned = "error" } = input;

  if (participants.length === 0) {
    throw new SplitError("NO_PARTICIPANTS", "At least one participant is required");
  }
  const index = new Map<string, number>();
  participants.forEach((p, i) => {
    if (index.has(p)) throw new SplitError("DUPLICATE_PARTICIPANT", `Duplicate participant "${p}"`);
    index.set(p, i);
  });

  const n = participants.length;
  const itemCents: Cents[] = new Array<Cents>(n).fill(0);
  let itemsTotal = 0;

  for (const item of items) {
    assertCents(item.totalCents, `item "${item.id}"`);
    itemsTotal += item.totalCents;

    // Merge duplicate claims by the same person.
    const weightByIdx = new Map<number, number>();
    for (const share of item.shares) {
      const idx = index.get(share.participantId);
      if (idx === undefined) {
        throw new SplitError(
          "UNKNOWN_PARTICIPANT",
          `Item "${item.id}" references unknown participant "${share.participantId}"`,
        );
      }
      const w = share.weight ?? 1;
      if (!Number.isSafeInteger(w) || w < 0) {
        throw new SplitError("INVALID_WEIGHT", `Invalid weight ${w} on item "${item.id}"`);
      }
      weightByIdx.set(idx, (weightByIdx.get(idx) ?? 0) + w);
    }

    const totalWeight = [...weightByIdx.values()].reduce((a, b) => a + b, 0);
    if (totalWeight === 0) {
      if (item.totalCents === 0) continue;
      if (unassigned === "error") {
        throw new SplitError("UNASSIGNED_ITEM", `Item "${item.name ?? item.id}" has not been claimed`);
      }
      allocateEvenly(item.totalCents, n).forEach((c, i) => (itemCents[i] += c));
      continue;
    }

    // Allocate in participant order so tie-breaking is stable.
    const weights = participants.map((_, i) => weightByIdx.get(i) ?? 0);
    allocate(item.totalCents, weights).forEach((c, i) => (itemCents[i] += c));
  }

  const adjByPerson: Record<string, Cents>[] = participants.map(() => ({}));
  let adjustmentsTotal = 0;
  const hasItemSubtotal = itemCents.some((c) => c !== 0);

  for (const adj of adjustments) {
    assertCents(adj.amountCents, `adjustment "${adj.id}"`);
    adjustmentsTotal += adj.amountCents;
    const mode = adj.allocation ?? "proportional";

    let parts: Cents[];
    if (mode === "proportional" && hasItemSubtotal && itemCents.every((c) => c >= 0)) {
      parts = allocate(adj.amountCents, itemCents);
    } else {
      // Equal split, or proportional with nothing to be proportional to.
      parts = allocateEvenly(adj.amountCents, n);
    }
    parts.forEach((c, i) => {
      adjByPerson[i][adj.id] = (adjByPerson[i][adj.id] ?? 0) + c;
    });
  }

  const result: ParticipantSplit[] = participants.map((participantId, i) => {
    const adjTotal = Object.values(adjByPerson[i]).reduce((a, b) => a + b, 0);
    return {
      participantId,
      itemsCents: itemCents[i],
      adjustments: adjByPerson[i],
      totalCents: itemCents[i] + adjTotal,
    };
  });

  return {
    participants: result,
    itemsTotalCents: itemsTotal,
    adjustmentsTotalCents: adjustmentsTotal,
    grandTotalCents: itemsTotal + adjustmentsTotal,
  };
}

function assertCents(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new SplitError("INVALID_AMOUNT", `${what}: amount must be an integer number of cents, got ${value}`);
  }
}
