import { z } from "zod";

const urlSafeToken = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const uuidParamSchema = z.string().uuid();

export const shareTokenParamSchema = urlSafeToken;

export const inviteTokenParamSchema = urlSafeToken;

export function parseUuidParam(value: string): string | null {
  const parsed = uuidParamSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseShareTokenParam(value: string): string | null {
  const parsed = shareTokenParamSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseInviteTokenParam(value: string): string | null {
  const parsed = inviteTokenParamSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
