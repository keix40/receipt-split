import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { rememberGroupId } from "@/lib/guest/cookies";
import { computeNetBalances, simplifyDebts, type LedgerEntry } from "@/lib/split";

export async function createGroup(name: string, currency: string) {
  const db = getDb();
  const [group] = await db
    .insert(schema.groups)
    .values({ name, currency: currency.toUpperCase() })
    .returning();
  await rememberGroupId(group.id);
  return group;
}

export async function getGroupBundle(groupId: string) {
  const db = getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
  if (!group) return null;

  const members = await db
    .select()
    .from(schema.groupMembers)
    .where(eq(schema.groupMembers.groupId, groupId))
    .orderBy(asc(schema.groupMembers.joinedAt));

  const receipts = await db
    .select()
    .from(schema.receipts)
    .where(eq(schema.receipts.groupId, groupId))
    .orderBy(desc(schema.receipts.createdAt));

  const finalizedIds = receipts.filter((r) => r.status === "finalized").map((r) => r.id);
  const shares =
    finalizedIds.length === 0
      ? []
      : await db.select().from(schema.receiptShares).where(inArray(schema.receiptShares.receiptId, finalizedIds));

  const settlements = await db
    .select()
    .from(schema.settlements)
    .where(eq(schema.settlements.groupId, groupId))
    .orderBy(desc(schema.settlements.createdAt));

  return { group, members, receipts, shares, settlements };
}

export function buildGroupLedger(
  receipts: { id: string; paidBy: string | null }[],
  shares: { receiptId: string; memberId: string; totalCents: number }[],
  settlements: { fromMemberId: string; toMemberId: string; amountCents: number }[],
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const receipt of receipts) {
    if (!receipt.paidBy) continue;
    const owed: Record<string, number> = {};
    for (const s of shares.filter((x) => x.receiptId === receipt.id)) {
      owed[s.memberId] = s.totalCents;
    }
    if (Object.keys(owed).length > 0) {
      entries.push({ kind: "expense", paidBy: receipt.paidBy, owed });
    }
  }

  for (const s of settlements) {
    entries.push({
      kind: "settlement",
      from: s.fromMemberId,
      to: s.toMemberId,
      amountCents: s.amountCents,
    });
  }

  return entries;
}

export function groupBalancesAndTransfers(
  memberIds: string[],
  ledger: LedgerEntry[],
): { net: Map<string, number>; transfers: ReturnType<typeof simplifyDebts> } {
  const net = computeNetBalances(ledger);
  for (const id of memberIds) {
    if (!net.has(id)) net.set(id, 0);
  }
  const transfers = simplifyDebts(net);
  return { net, transfers };
}

export async function recordSettlement(
  groupId: string,
  fromMemberId: string,
  toMemberId: string,
  amountCents: number,
  currency: string,
  note?: string,
) {
  const db = getDb();
  const bundle = await getGroupBundle(groupId);
  if (!bundle) return { error: "not_found" as const };

  const memberSet = new Set(bundle.members.map((m) => m.id));
  if (!memberSet.has(fromMemberId) || !memberSet.has(toMemberId)) {
    return { error: "bad_member" as const };
  }

  const [row] = await db
    .insert(schema.settlements)
    .values({
      groupId,
      fromMemberId,
      toMemberId,
      amountCents,
      currency,
      note: note ?? null,
    })
    .returning();
  return { settlement: row };
}

export async function listGroupsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const db = getDb();
  return db.select().from(schema.groups).where(inArray(schema.groups.id, ids)).orderBy(desc(schema.groups.createdAt));
}
