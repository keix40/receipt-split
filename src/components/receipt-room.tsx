"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { readApiErrorMessage } from "@/lib/api/read-error-response";
import { formatMoney } from "@/lib/money";
import { computeLiveSplit } from "@/lib/receipt/split-from-db";

export type ReceiptRoomProps = {
  shareToken: string;
  currency: string;
  merchant: string | null;
  status: "draft" | "assigning" | "finalized";
  items: { id: string; name: string; totalCents: number; position: number }[];
  members: { id: string; displayName: string }[];
  claims: { itemId: string; memberId: string; weight: number }[];
  shares: {
    memberId: string;
    itemsCents: number;
    taxCents: number;
    tipCents: number;
    otherCents: number;
    totalCents: number;
  }[];
  currentMemberId: string | null;
  paidByMemberId: string | null;
  adjustments: {
    taxCents: number;
    tipCents: number;
    serviceChargeCents: number;
    discountCents: number;
  };
  groupId: string;
};

export function ReceiptRoom(props: ReceiptRoomProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState(props.paidByMemberId ?? props.members[0]?.id ?? "");

  const memberName = (id: string) => props.members.find((m) => m.id === id)?.displayName ?? id.slice(0, 8);

  const splitPreview = useMemo(() => {
    if (props.status === "finalized") return null;
    const rows = props.items.map((it) => ({
      itemId: it.id,
      itemName: it.name,
      totalCents: it.totalCents,
      claims: props.claims.filter((c) => c.itemId === it.id).map((c) => ({ memberId: c.memberId, weight: c.weight })),
    }));
    return computeLiveSplit(
      props.members.map((m) => m.id),
      rows,
      props.adjustments,
    );
  }, [props]);

  const fmt = (c: number) => formatMoney(c, props.currency);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${props.shareToken}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  async function toggleClaim(itemId: string) {
    if (!props.currentMemberId) return;
    const has = props.claims.some((c) => c.itemId === itemId && c.memberId === props.currentMemberId);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${props.shareToken}/claims`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, action: has ? "unclaim" : "claim" }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update claim");
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${props.shareToken}/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paidByMemberId: paidBy }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalize");
    } finally {
      setBusy(false);
    }
  }

  const locked = props.status === "finalized";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{props.merchant ?? "Receipt"}</h1>
        <p className="text-stone-600 dark:text-stone-400">
          {locked ? "Finalized — amounts are locked." : "Tap the items you had. Tax and tip split proportionally."}
        </p>
        <a href={`/groups/${props.groupId}`} className="text-sm text-stone-500 underline">
          View group balances
        </a>
      </header>

      {!props.currentMemberId && !locked && (
        <section className="flex flex-col gap-2 rounded-xl border p-4 dark:border-stone-700">
          <h2 className="font-semibold">Join this split</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[12rem] flex-1 rounded-lg border px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || name.trim().length === 0}
              onClick={() => void join()}
              className="rounded-lg bg-stone-900 px-4 py-2 text-white dark:bg-white dark:text-stone-900"
            >
              Join
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Line items</h2>
        <ul className="flex flex-col gap-2">
          {props.items.map((item) => {
            const itemClaims = props.claims.filter((c) => c.itemId === item.id);
            const mine = props.currentMemberId
              ? itemClaims.some((c) => c.memberId === props.currentMemberId)
              : false;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={locked || !props.currentMemberId || busy}
                  onClick={() => void toggleClaim(item.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                    mine
                      ? "border-stone-900 bg-stone-100 dark:border-white dark:bg-stone-800"
                      : "border-stone-200 dark:border-stone-700"
                  }`}
                >
                  <span>
                    {item.name}
                    {itemClaims.length > 0 && (
                      <span className="mt-1 block text-xs text-stone-500">
                        {itemClaims.map((c) => memberName(c.memberId)).join(", ")}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{fmt(item.totalCents)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Split summary</h2>
        <ul className="divide-y rounded-xl border dark:divide-stone-800 dark:border-stone-700">
          {locked
            ? props.shares.map((row) => (
                <li key={row.memberId} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex justify-between font-medium">
                    <span>{memberName(row.memberId)}</span>
                    <span className="tabular-nums">{fmt(row.totalCents)}</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    Items {fmt(row.itemsCents)} · tax {fmt(row.taxCents)} · tip {fmt(row.tipCents)}
                  </div>
                </li>
              ))
            : (splitPreview?.participants ?? []).map((row) => (
                <li key={row.participantId} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex justify-between font-medium">
                    <span>{memberName(row.participantId)}</span>
                    <span className="tabular-nums">{fmt(row.totalCents)}</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    Items {fmt(row.itemsCents)} · tax {fmt(row.adjustments.tax ?? 0)} · tip{" "}
                    {fmt(row.adjustments.tip ?? 0)}
                  </div>
                </li>
              ))}
        </ul>
      </section>

      {!locked && props.currentMemberId && props.members.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border p-4 dark:border-stone-700">
          <h2 className="font-semibold">Finalize</h2>
          <label className="flex flex-col gap-1 text-sm">
            Who paid the bill?
            <select
              className="rounded-lg border px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
            >
              {props.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !paidBy}
            onClick={() => void finalize()}
            className="w-fit rounded-lg bg-stone-900 px-4 py-2 text-white dark:bg-white dark:text-stone-900"
          >
            Lock split & add to group ledger
          </button>
        </section>
      )}
    </div>
  );
}
