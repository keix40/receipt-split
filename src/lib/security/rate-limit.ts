/**
 * In-memory sliding-window rate limit keyed by string (typically client IP).
 *
 * Limits (per serverless instance — not global):
 * - Resets on cold starts and is not shared across regions/instances.
 * - Suitable as a free baseline; upgrade to Redis/Upstash for strict quotas.
 */
type Bucket = { count: number; windowStart: number };

const store = new Map<string, Bucket>();

export type RateLimitConfig = {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now - existing.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: config.limit - 1 };
  }

  if (existing.count >= config.limit) {
    const retryAfterMs = config.windowMs - (now - existing.windowStart);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  existing.count += 1;
  return { ok: true, remaining: config.limit - existing.count };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/** Prevent unbounded Map growth in long-lived dev processes. */
export function _resetRateLimitStoreForTests(): void {
  store.clear();
}
