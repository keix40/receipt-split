import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { setMemberForGroup, setMemberForReceipt } from "@/lib/guest/cookies";
import { parseShareTokenParam } from "@/lib/ids";
import { newShareToken } from "@/lib/tokens";
import { buildSplitInput } from "@/lib/receipt/split-from-db";
import { splitReceipt } from "@/lib/split";
import type { saveReceiptSchema } from "@/lib/receipt/schemas";
import type { z } from "zod";

type SaveInput = z.infer<typeof saveReceiptSchema>;

export async function createReceiptFromDraft(input: SaveInput) {
  const db = getDb();
  const shareToken = newShareToken();

  return db.transaction(async (tx) => {
    let groupId = input.groupId;
    if (!groupId) {
      const [group] = await tx
        .insert(schema.groups)
        .values({
          name: input.groupName?.trim() || input.merchant?.trim() || "Receipt split",
          currency: input.currency.toUpperCase(),
          inviteToken: newShareToken(),
        })
        .returning({ id: schema.groups.id });
      groupId = group.id;
    }

    const [receipt] = await tx
      .insert(schema.receipts)
      .values({
        shareToken,
        groupId,
        imageUrl: input.imageUrl,
        merchant: input.merchant ?? null,
        receiptDate: input.date ?? null,
        currency: input.currency.toUpperCase(),
        subtotalCents: input.subtotalCents ?? null,
        taxCents: input.taxCents,
        tipCents: input.tipCents,
        serviceChargeCents: input.serviceChargeCents,
        discountCents: input.discountCents,
        totalCents: input.totalCents ?? null,
        status: "assigning",
        ocrSource: input.ocrSource ?? "manual",
      })
      .returning({ id: schema.receipts.id, shareToken: schema.receipts.shareToken, groupId: schema.receipts.groupId });

    await tx.insert(schema.receiptItems).values(
      input.items.map((it, i) => ({
        receiptId: receipt.id,
        position: input.items[i]?.position ?? i,
        name: it.name,
        quantity: String(it.quantity),
        totalCents: it.totalCents,
      })),
    );

    return receipt;
  });
}

export async function getReceiptByShareToken(shareToken: string) {
  if (!parseShareTokenParam(shareToken)) return null;

  const db = getDb();
  const [receipt] = await db.select().from(schema.receipts).where(eq(schema.receipts.shareToken, shareToken)).limit(1);
  if (!receipt) return null;

  const items = await db
    .select()
    .from(schema.receiptItems)
    .where(eq(schema.receiptItems.receiptId, receipt.id))
    .orderBy(asc(schema.receiptItems.position));

  const members = await db
    .select()
    .from(schema.groupMembers)
    .where(eq(schema.groupMembers.groupId, receipt.groupId))
    .orderBy(asc(schema.groupMembers.joinedAt));

  const itemIds = items.map((i) => i.id);
  const claims =
    itemIds.length === 0
      ? []
      : await db.select().from(schema.itemClaims).where(inArray(schema.itemClaims.itemId, itemIds));

  const shares =
    receipt.status === "finalized"
      ? await db.select().from(schema.receiptShares).where(eq(schema.receiptShares.receiptId, receipt.id))
      : [];

  return { receipt, items, members, claims, shares };
}

export async function joinReceiptAsGuest(shareToken: string, displayName: string) {
  const db = getDb();
  const bundle = await getReceiptByShareToken(shareToken);
  if (!bundle) return { error: "not_found" as const };
  if (bundle.receipt.status === "finalized") return { error: "finalized" as const };

  const [member] = await db
    .insert(schema.groupMembers)
    .values({
      groupId: bundle.receipt.groupId,
      displayName,
    })
    .returning({ id: schema.groupMembers.id });

  await setMemberForReceipt(shareToken, member.id);
  await setMemberForGroup(bundle.receipt.groupId, member.id);
  return { memberId: member.id, groupId: bundle.receipt.groupId };
}

export async function mutateClaim(
  shareToken: string,
  memberId: string,
  itemId: string,
  action: "claim" | "unclaim" | "setWeight",
  weight?: number,
) {
  const db = getDb();
  const bundle = await getReceiptByShareToken(shareToken);
  if (!bundle) return { error: "not_found" as const };
  if (bundle.receipt.status === "finalized") return { error: "finalized" as const };

  const item = bundle.items.find((i) => i.id === itemId);
  if (!item || item.receiptId !== bundle.receipt.id) return { error: "bad_item" as const };

  const isMember = bundle.members.some((m) => m.id === memberId);
  if (!isMember) return { error: "not_member" as const };

  if (action === "unclaim") {
    await db
      .delete(schema.itemClaims)
      .where(and(eq(schema.itemClaims.itemId, itemId), eq(schema.itemClaims.memberId, memberId)));
    return { ok: true as const };
  }

  const w = action === "setWeight" ? (weight ?? 1) : 1;
  await db
    .insert(schema.itemClaims)
    .values({ itemId, memberId, weight: w })
    .onConflictDoUpdate({
      target: [schema.itemClaims.itemId, schema.itemClaims.memberId],
      set: { weight: w },
    });
  return { ok: true as const };
}

export async function finalizeReceipt(shareToken: string, paidByMemberId: string) {
  const db = getDb();
  const bundle = await getReceiptByShareToken(shareToken);
  if (!bundle) return { error: "not_found" as const };
  if (bundle.receipt.status === "finalized") return { error: "finalized" as const };

  if (!bundle.members.some((m) => m.id === paidByMemberId)) {
    return { error: "bad_payer" as const };
  }

  const memberIds = bundle.members.map((m) => m.id);
  const splitItems = bundle.items.map((it) => ({
    itemId: it.id,
    itemName: it.name,
    totalCents: it.totalCents,
    claims: bundle.claims.filter((c) => c.itemId === it.id).map((c) => ({ memberId: c.memberId, weight: c.weight })),
  }));

  let split;
  try {
    split = splitReceipt(
      buildSplitInput(
        memberIds,
        splitItems,
        {
          taxCents: bundle.receipt.taxCents,
          tipCents: bundle.receipt.tipCents,
          serviceChargeCents: bundle.receipt.serviceChargeCents,
          discountCents: bundle.receipt.discountCents,
        },
        "error",
      ),
    );
  } catch {
    return { error: "unassigned_items" as const };
  }

  await db.transaction(async (tx) => {
    await tx.insert(schema.receiptShares).values(
      split.participants.map((p) => ({
        receiptId: bundle.receipt.id,
        memberId: p.participantId,
        itemsCents: p.itemsCents,
        taxCents: p.adjustments.tax ?? 0,
        tipCents: p.adjustments.tip ?? 0,
        otherCents: (p.adjustments.service ?? 0) + (p.adjustments.discount ?? 0),
        totalCents: p.totalCents,
      })),
    );
    await tx
      .update(schema.receipts)
      .set({
        status: "finalized",
        paidBy: paidByMemberId,
        finalizedAt: new Date(),
      })
      .where(eq(schema.receipts.id, bundle.receipt.id));
  });

  return { ok: true as const };
}
