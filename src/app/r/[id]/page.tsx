import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReceiptRoom } from "@/components/receipt-room";
import { getMemberIdForReceipt } from "@/lib/guest/cookies";
import { getReceiptByShareToken } from "@/lib/receipt/service";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const bundle = await getReceiptByShareToken(id);
  return { title: bundle?.receipt.merchant ? `${bundle.receipt.merchant} · Split` : "Receipt split" };
}

export default async function ReceiptPage({ params }: Props) {
  const { id: shareToken } = await params;
  const bundle = await getReceiptByShareToken(shareToken);
  if (!bundle) notFound();

  const currentMemberId = await getMemberIdForReceipt(shareToken);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <ReceiptRoom
        shareToken={shareToken}
        currency={bundle.receipt.currency}
        merchant={bundle.receipt.merchant}
        status={bundle.receipt.status}
        groupId={bundle.receipt.groupId}
        paidByMemberId={bundle.receipt.paidBy}
        currentMemberId={currentMemberId}
        adjustments={{
          taxCents: bundle.receipt.taxCents,
          tipCents: bundle.receipt.tipCents,
          serviceChargeCents: bundle.receipt.serviceChargeCents,
          discountCents: bundle.receipt.discountCents,
        }}
        items={bundle.items.map((it) => ({
          id: it.id,
          name: it.name,
          totalCents: it.totalCents,
          position: it.position,
        }))}
        members={bundle.members.map((m) => ({ id: m.id, displayName: m.displayName }))}
        claims={bundle.claims.map((c) => ({
          itemId: c.itemId,
          memberId: c.memberId,
          weight: c.weight,
        }))}
        shares={bundle.shares.map((s) => ({
          memberId: s.memberId,
          itemsCents: s.itemsCents,
          taxCents: s.taxCents,
          tipCents: s.tipCents,
          otherCents: s.otherCents,
          totalCents: s.totalCents,
        }))}
      />
    </main>
  );
}
