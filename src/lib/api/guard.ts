import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, type RateLimitConfig } from "@/lib/security/rate-limit";
import { isSameOriginRequest } from "@/lib/security/same-origin";

export function guardApiRequest(
  request: Request,
  routeKey: string,
  limit: RateLimitConfig,
): NextResponse | null {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rl = checkRateLimit(`${routeKey}:${ip}`, limit);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  return null;
}
