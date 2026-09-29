import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Money is stored as integer minor units ("cents") in `integer` columns.
 * Switch to `bigint` if you ever expect single amounts above ~21 million.
 */

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Users. Better Auth (milestone 2) generates its own user/session/account
// tables. This table keeps the id/email/name the app needs; align it with the
// generated schema when auth is wired up.
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt,
});

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Unguessable token for read-only group access (?invite=). */
    inviteToken: varchar("invite_token", { length: 64 }).notNull(),
    name: text("name").notNull(),
    /** Default ISO 4217 currency for the group's receipts. */
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
  },
  (t) => [uniqueIndex("groups_invite_token_uq").on(t.inviteToken)],
);

/**
 * Members may be registered users or guests (userId null) so friends can be
 * added to a split without signing up.
 */
export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("group_members_group_idx").on(t.groupId),
    uniqueIndex("group_members_group_user_uq").on(t.groupId, t.userId),
  ],
);

export const receiptStatus = pgEnum("receipt_status", ["draft", "assigning", "finalized"]);
export const ocrSource = pgEnum("ocr_source", ["vision", "tesseract", "manual"]);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Unguessable token used in share URLs (/r/[shareToken]). */
    shareToken: varchar("share_token", { length: 64 }).notNull().unique(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").references(() => groupMembers.id, { onDelete: "set null" }),
    paidBy: uuid("paid_by").references(() => groupMembers.id, { onDelete: "restrict" }),
    imageUrl: text("image_url"),
    merchant: text("merchant"),
    receiptDate: date("receipt_date"),
    currency: varchar("currency", { length: 3 }).notNull(),
    subtotalCents: integer("subtotal_cents"),
    taxCents: integer("tax_cents").notNull().default(0),
    tipCents: integer("tip_cents").notNull().default(0),
    serviceChargeCents: integer("service_charge_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents"),
    status: receiptStatus("status").notNull().default("draft"),
    ocrSource: ocrSource("ocr_source"),
    /** Raw validated model output, kept for debugging and re-parsing. */
    ocrRaw: jsonb("ocr_raw"),
    createdAt,
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (t) => [index("receipts_group_idx").on(t.groupId, t.createdAt)],
);

export const receiptItems = pgTable(
  "receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
    totalCents: integer("total_cents").notNull(),
  },
  (t) => [index("receipt_items_receipt_idx").on(t.receiptId, t.position)],
);

/** "I had this" taps. weight lets someone take 2 of 3 portions. */
export const itemClaims = pgTable(
  "item_claims",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => receiptItems.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "cascade" }),
    weight: integer("weight").notNull().default(1),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.itemId, t.memberId] })],
);

/**
 * Immutable snapshot of the split engine output, written when a receipt is
 * finalized. Balances are computed from these rows + settlements, so editing
 * the engine later never rewrites history.
 */
export const receiptShares = pgTable(
  "receipt_shares",
  {
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    itemsCents: integer("items_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    tipCents: integer("tip_cents").notNull(),
    otherCents: integer("other_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
  },
  (t) => [primaryKey({ columns: [t.receiptId, t.memberId] })],
);

/** Recorded repayments ("Alex paid Sam back $12.40"). */
export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromMemberId: uuid("from_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    toMemberId: uuid("to_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    note: text("note"),
    createdAt,
  },
  (t) => [index("settlements_group_idx").on(t.groupId, t.createdAt)],
);
