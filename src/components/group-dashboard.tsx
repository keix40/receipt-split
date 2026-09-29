"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readApiErrorMessage } from "@/lib/api/read-error-response";
import { formatMoney } from "@/lib/money";

export type GroupDashboardProps = {
  groupId: string;
  groupName: string;
  inviteLink?: string;
  currency: string;
  members: { id: string; displayName: string }[];
  receipts: {
    id: string;
    shareToken: string;
    merchant: string | null;
    status: string;
    totalCents: number | null;
  }[];
  balances: { memberId: string; cents: number }[];
  transfers: { from: string; to: string; amountCents: number }[];
  canSettle?: boolean;
};

export function GroupDashboard(props: GroupDashboardProps) {
  const router = useRouter();
  const [from, setFrom] = useState(props.members[0]?.id ?? "");
  const [to, setTo] = useState(props.members[1]?.id ?? props.members[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = (id: string) => props.members.find((m) => m.id === id)?.displayName ?? id.slice(0, 8);
  const fmt = (c: number) => formatMoney(c, props.currency);

  async function recordSettlement(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${props.groupId}/settlements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromMemberId: from, toMemberId: to, amountCents }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      router.refresh();
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{props.groupName}</h1>
        <p className="text-stone-600 dark:text-stone-400">Running balances from finalized receipts and settlements.</p>
        {props.inviteLink && (
          <p className="text-sm text-stone-500">
            Share view-only link:{" "}
            <a href={props.inviteLink} className="break-all underline">
              {props.inviteLink}
            </a>
          </p>
        )}
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Receipts</h2>
        <ul className="divide-y rounded-xl border dark:divide-stone-800 dark:border-stone-700">
          {props.receipts.length === 0 && (
            <li className="px-4 py-4 text-sm text-stone-500">No receipts yet.</li>
          )}
          {props.receipts.map((r) => (
            <li key={r.id}>
              <Link href={`/r/${r.shareToken}`} className="flex justify-between px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-900">
                <span>
                  {r.merchant ?? "Receipt"}{" "}
                  <span className="text-xs text-stone-500">{r.status}</span>
                </span>
                {r.totalCents != null && <span className="tabular-nums">{fmt(r.totalCents)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Net balances</h2>
        <ul className="divide-y rounded-xl border dark:divide-stone-800 dark:border-stone-700">
          {props.balances.map((b) => (
            <li key={b.memberId} className="flex justify-between px-4 py-3 text-sm">
              <span>{name(b.memberId)}</span>
              <span className={`tabular-nums ${b.cents >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {b.cents >= 0 ? "+" : ""}
                {fmt(b.cents)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Simplified transfers</h2>
        {props.transfers.length === 0 ? (
          <p className="text-sm text-stone-500">Everyone is settled up.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {props.transfers.map((t, i) => (
              <li key={i} className="rounded-lg border px-4 py-2 dark:border-stone-700">
                {name(t.from)} pays {name(t.to)} {fmt(t.amountCents)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {props.canSettle !== false && props.members.length >= 2 && (
        <section className="rounded-xl border p-4 dark:border-stone-700">
          <h2 className="mb-3 font-semibold">Record a settlement</h2>
          <form onSubmit={(e) => void recordSettlement(e)} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                From
                <select
                  className="rounded-lg border px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  {props.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                To
                <select
                  className="rounded-lg border px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                >
                  {props.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Amount ({props.currency})
              <input
                type="number"
                min={0.01}
                step={0.01}
                required
                className="rounded-lg border px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-fit rounded-lg bg-stone-900 px-4 py-2 text-white dark:bg-white dark:text-stone-900"
            >
              Record payment
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
