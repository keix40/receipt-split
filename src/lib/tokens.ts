import { randomBytes } from "node:crypto";

/** URL-safe opaque token for receipt share links. */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}
