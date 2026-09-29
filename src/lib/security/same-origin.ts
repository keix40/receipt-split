/**
 * Reject cross-site API abuse: require Origin or Referer to match the request Host.
 * Server-side tests may omit both headers when NODE_ENV=test.
 */
export function isSameOriginRequest(request: Request): boolean {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (!host) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  }

  return process.env.NODE_ENV === "test";
}
