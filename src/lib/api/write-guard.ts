import { guardApiRequest } from "@/lib/api/guard";

/** Same-origin + per-IP limits for mutating API routes. */
export const WRITE_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export function guardWriteRequest(request: Request, routeKey: string) {
  return guardApiRequest(request, routeKey, WRITE_RATE_LIMIT);
}
