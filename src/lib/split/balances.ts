import type { Cents, ParticipantId } from "./types";

export type LedgerEntry =
  | {
      kind: "expense";
      /** Who paid the bill. */
      paidBy: ParticipantId;
      /** What each person owes for this bill (e.g. from splitReceipt). Includes the payer's own share. */
      owed: Record<ParticipantId, Cents>;
    }
  | {
      kind: "settlement";
      from: ParticipantId;
      to: ParticipantId;
      amountCents: Cents;
    };

export interface Transfer {
  from: ParticipantId;
  to: ParticipantId;
  amountCents: Cents;
}

/**
 * Net balance per person: positive = the group owes them, negative = they owe the group.
 * The balances always sum to zero.
 */
export function computeNetBalances(entries: readonly LedgerEntry[]): Map<ParticipantId, Cents> {
  const net = new Map<ParticipantId, Cents>();
  const add = (p: ParticipantId, c: Cents) => net.set(p, (net.get(p) ?? 0) + c);

  for (const e of entries) {
    if (e.kind === "expense") {
      for (const [p, c] of Object.entries(e.owed)) {
        add(p, -c);
        add(e.paidBy, c);
      }
    } else {
      // Paying someone back increases your balance and decreases theirs.
      add(e.from, e.amountCents);
      add(e.to, -e.amountCents);
    }
  }
  return net;
}

/**
 * Turn net balances into a short list of transfers ("who pays whom").
 *
 * Greedy: repeatedly match the largest debtor with the largest creditor and
 * transfer min(|debt|, credit). Each step settles at least one person, so the
 * result has at most (people with non-zero balance − 1) transfers.
 *
 * Finding the absolute minimum number of transfers is NP-hard in general;
 * this greedy approach is the standard practical choice. Ties are broken by
 * participant id for deterministic output.
 */
export function simplifyDebts(net: ReadonlyMap<ParticipantId, Cents>): Transfer[] {
  const sum = [...net.values()].reduce((a, b) => a + b, 0);
  if (sum !== 0) throw new Error(`simplifyDebts: balances must sum to zero (got ${sum})`);

  const creditors = [...net].filter(([, c]) => c > 0).map(([id, c]) => ({ id, amt: c }));
  const debtors = [...net].filter(([, c]) => c < 0).map(([id, c]) => ({ id, amt: -c }));
  const byAmountDesc = (a: { id: string; amt: number }, b: { id: string; amt: number }) =>
    b.amt - a.amt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const transfers: Transfer[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmountDesc);
    debtors.sort(byAmountDesc);
    const c = creditors[0];
    const d = debtors[0];
    const amt = Math.min(c.amt, d.amt);
    transfers.push({ from: d.id, to: c.id, amountCents: amt });
    c.amt -= amt;
    d.amt -= amt;
    if (c.amt === 0) creditors.shift();
    if (d.amt === 0) debtors.shift();
  }
  return transfers;
}
