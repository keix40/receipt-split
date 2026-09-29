import { describe, expect, it } from "vitest";
import { computeNetBalances, simplifyDebts, type LedgerEntry, type Transfer } from "@/lib/split";

function applyTransfers(net: Map<string, number>, transfers: Transfer[]) {
  const out = new Map(net);
  for (const t of transfers) {
    out.set(t.from, (out.get(t.from) ?? 0) + t.amountCents);
    out.set(t.to, (out.get(t.to) ?? 0) - t.amountCents);
  }
  return out;
}

describe("computeNetBalances", () => {
  it("credits the payer and debits each diner", () => {
    const net = computeNetBalances([
      { kind: "expense", paidBy: "alice", owed: { alice: 4267, bob: 4667, cara: 266 } },
    ]);
    expect(Object.fromEntries(net)).toEqual({ alice: 4933, bob: -4667, cara: -266 });
  });

  it("applies settlements", () => {
    const net = computeNetBalances([
      { kind: "expense", paidBy: "alice", owed: { alice: 4267, bob: 4667, cara: 266 } },
      { kind: "settlement", from: "bob", to: "alice", amountCents: 4667 },
    ]);
    expect(Object.fromEntries(net)).toEqual({ alice: 266, bob: 0, cara: -266 });
  });

  it("always sums to zero", () => {
    const net = computeNetBalances([
      { kind: "expense", paidBy: "a", owed: { a: 100, b: 250, c: 333 } },
      { kind: "expense", paidBy: "b", owed: { a: 999, c: 1 } },
      { kind: "settlement", from: "c", to: "a", amountCents: 50 },
    ]);
    expect([...net.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });
});

describe("simplifyDebts", () => {
  it("produces who-pays-whom for one dinner", () => {
    const net = new Map([
      ["alice", 4933],
      ["bob", -4667],
      ["cara", -266],
    ]);
    expect(simplifyDebts(net)).toEqual([
      { from: "bob", to: "alice", amountCents: 4667 },
      { from: "cara", to: "alice", amountCents: 266 },
    ]);
  });

  it("collapses chains: A owes B and B owes C becomes A pays C", () => {
    const entries: LedgerEntry[] = [
      { kind: "expense", paidBy: "b", owed: { a: 1000 } },
      { kind: "expense", paidBy: "c", owed: { b: 1000 } },
    ];
    expect(simplifyDebts(computeNetBalances(entries))).toEqual([{ from: "a", to: "c", amountCents: 1000 }]);
  });

  it("returns nothing when everyone is settled", () => {
    expect(simplifyDebts(new Map([["a", 0], ["b", 0]]))).toEqual([]);
  });

  it("rejects balances that do not sum to zero", () => {
    expect(() => simplifyDebts(new Map([["a", 5]]))).toThrow(/sum to zero/);
  });

  it("settles everyone with at most n-1 positive transfers (property)", () => {
    let seed = 99;
    const rand = (max: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % max;
    };
    for (let run = 0; run < 300; run++) {
      const people = Array.from({ length: 2 + rand(8) }, (_, i) => `p${i}`);
      const entries: LedgerEntry[] = Array.from({ length: 1 + rand(6) }, () => ({
        kind: "expense" as const,
        paidBy: people[rand(people.length)],
        owed: Object.fromEntries(people.map((p) => [p, rand(5_000)])),
      }));
      const net = computeNetBalances(entries);
      const transfers = simplifyDebts(net);
      const nonZero = [...net.values()].filter((c) => c !== 0).length;

      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      transfers.forEach((t) => expect(t.amountCents).toBeGreaterThan(0));
      [...applyTransfers(net, transfers).values()].forEach((c) => expect(c).toBe(0));
    }
  });
});
