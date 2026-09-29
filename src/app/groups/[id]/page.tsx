import { notFound } from "next/navigation";
import Link from "next/link";
import { GroupDashboard } from "@/components/group-dashboard";
import { GroupRememberClient } from "@/components/group-remember-client";
import { resolveGroupAccess } from "@/lib/groups/access";
import {
  buildGroupLedger,
  getGroupBundle,
  groupBalancesAndTransfers,
} from "@/lib/groups/service";
import { getMemberIdForGroup } from "@/lib/guest/cookies";
import { parseUuidParam } from "@/lib/ids";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
};

export default async function GroupPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!parseUuidParam(id)) notFound();

  const bundle = await getGroupBundle(id);
  if (!bundle) notFound();

  const { invite } = await searchParams;
  const memberId = await getMemberIdForGroup(id);
  const access = resolveGroupAccess(bundle.group, bundle.members, memberId, invite);
  if (access.kind === "denied") notFound();

  const canSettle = access.kind === "member";

  const finalized = bundle.receipts.filter((r) => r.status === "finalized");
  const ledger = buildGroupLedger(
    finalized.map((r) => ({ id: r.id, paidBy: r.paidBy })),
    bundle.shares.map((s) => ({
      receiptId: s.receiptId,
      memberId: s.memberId,
      totalCents: s.totalCents,
    })),
    bundle.settlements.map((s) => ({
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountCents: s.amountCents,
    })),
  );

  const { net, transfers } = groupBalancesAndTransfers(
    bundle.members.map((m) => m.id),
    ledger,
  );

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      {canSettle && <GroupRememberClient groupId={bundle.group.id} />}
      {access.kind === "invite" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          View-only link — join a receipt in this group to record settlements.
        </p>
      )}
      <GroupDashboard
        groupId={bundle.group.id}
        groupName={bundle.group.name}
        currency={bundle.group.currency}
        members={bundle.members.map((m) => ({ id: m.id, displayName: m.displayName }))}
        receipts={bundle.receipts.map((r) => ({
          id: r.id,
          shareToken: r.shareToken,
          merchant: r.merchant,
          status: r.status,
          totalCents: r.totalCents,
        }))}
        balances={[...net.entries()].map(([memberId, cents]) => ({ memberId, cents }))}
        transfers={transfers.map((t) => ({
          from: t.from,
          to: t.to,
          amountCents: t.amountCents,
        }))}
        canSettle={canSettle}
        inviteLink={
          canSettle
            ? `/groups/${bundle.group.id}?invite=${encodeURIComponent(bundle.group.inviteToken)}`
            : undefined
        }
      />
      <Link href="/groups" className="text-sm text-stone-500 underline">
        All groups
      </Link>
    </main>
  );
}
