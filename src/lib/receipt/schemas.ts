import { z } from "zod";

const draftItemSchema = z.object({
  position: z.number().int().min(0),
  name: z.string().min(1).max(500),
  quantity: z.number().positive(),
  totalCents: z.number().int(),
});

export const saveReceiptSchema = z.object({
  imageUrl: z.string().url(),
  groupId: z.string().uuid().optional(),
  groupName: z.string().min(1).max(200).optional(),
  merchant: z.string().max(500).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  currency: z.string().length(3),
  items: z.array(draftItemSchema).min(1),
  subtotalCents: z.number().int().nullable().optional(),
  taxCents: z.number().int().min(0),
  tipCents: z.number().int().min(0),
  serviceChargeCents: z.number().int().min(0),
  discountCents: z.number().int().min(0),
  totalCents: z.number().int().nullable().optional(),
  ocrSource: z.enum(["vision", "tesseract", "manual"]).optional(),
});

export const joinReceiptSchema = z.object({
  displayName: z.string().min(1).max(100).trim(),
});

export const claimItemSchema = z.object({
  itemId: z.string().uuid(),
  action: z.enum(["claim", "unclaim", "setWeight"]),
  weight: z.number().int().min(1).max(100).optional(),
});

export const finalizeReceiptSchema = z.object({
  paidByMemberId: z.string().uuid(),
});

export const createGroupSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  currency: z.string().length(3).default("USD"),
});

export const recordSettlementSchema = z.object({
  fromMemberId: z.string().uuid(),
  toMemberId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  note: z.string().max(500).optional(),
});
