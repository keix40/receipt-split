/**
 * All money values are integer minor units ("cents"). Never floats.
 */
export type Cents = number;
export type ParticipantId = string;

export interface ItemShare {
  participantId: ParticipantId;
  /** Relative weight, e.g. 1 = one portion. Must be a non-negative integer. Defaults to 1. */
  weight?: number;
}

export interface SplitItem {
  id: string;
  name?: string;
  /** Line total for this item (qty × unit price), in cents. */
  totalCents: Cents;
  /** Who had this item. Empty = unassigned. */
  shares: ItemShare[];
}

export type AdjustmentAllocation = "proportional" | "equal";

/**
 * Receipt-level amounts that are not tied to a single item: tax, tip,
 * service charge, discounts (negative amounts), etc.
 */
export interface Adjustment {
  id: string;
  label?: string;
  amountCents: Cents;
  /** "proportional" = by each person's item subtotal (default). "equal" = same for everyone. */
  allocation?: AdjustmentAllocation;
}

export interface SplitInput {
  /** Order matters: it is the deterministic tie-breaker for leftover cents. */
  participants: ParticipantId[];
  items: SplitItem[];
  adjustments?: Adjustment[];
  /** What to do with items nobody claimed. Default: "error". */
  unassigned?: "error" | "split-equally";
}

export interface ParticipantSplit {
  participantId: ParticipantId;
  itemsCents: Cents;
  /** Amount of each adjustment charged to this participant, keyed by adjustment id. */
  adjustments: Record<string, Cents>;
  totalCents: Cents;
}

export interface SplitResult {
  participants: ParticipantSplit[];
  itemsTotalCents: Cents;
  adjustmentsTotalCents: Cents;
  grandTotalCents: Cents;
}

export class SplitError extends Error {
  constructor(
    public readonly code:
      | "NO_PARTICIPANTS"
      | "DUPLICATE_PARTICIPANT"
      | "UNKNOWN_PARTICIPANT"
      | "UNASSIGNED_ITEM"
      | "INVALID_AMOUNT"
      | "INVALID_WEIGHT",
    message: string,
  ) {
    super(message);
    this.name = "SplitError";
  }
}
