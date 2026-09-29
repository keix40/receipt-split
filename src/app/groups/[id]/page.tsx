import { notFound } from "next/navigation";
import Link from "next/link";
import { GroupDashboard } from "@/components/group-dashboard";
import {
  buildGroupLedger,
  getGroupBundle,
  groupBalancesAndTransfers,
} from "@/lib/groups/service";
import { rememberGroupId } from "@/lib/guest/cookies";

type Props = { params: Promise<{ id: string }> };

export default async function GroupPage({ params }: Props) {
  const { id } = await params;
  const bundle = await getGroupBundle(id);
  if (!bundle) notFound();

  await rememberGroupId(id);

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
      />
      <Link href="/groups" className="text-sm text-stone-500 underline">
        All groups
      </Link>
    </main>
  );
}
