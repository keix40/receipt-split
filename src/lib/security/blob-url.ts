/**
 * Restrict receipt image URLs to this project's Vercel Blob store host.
 *
 * Configure with `BLOB_STORE_HOST` (hostname only) or `BLOB_STORE_ID`
 * (becomes `{id}.public.blob.vercel-storage.com`).
 */
export function getBlobStoreHost(): string | null {
  const host = process.env.BLOB_STORE_HOST?.trim();
  if (host) {
    return host.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  }
  const storeId = process.env.BLOB_STORE_ID?.trim();
  if (storeId) {
    return `${storeId}.public.blob.vercel-storage.com`.toLowerCase();
  }
  return null;
}

export function isAllowedImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const allowedHost = getBlobStoreHost();
  if (!allowedHost) {
    // Fail closed in production; allow any *.public.blob host in dev/test when unset.
    if (process.env.NODE_ENV === "production") return false;
    return url.hostname.endsWith(".public.blob.vercel-storage.com");
  }
  return url.hostname.toLowerCase() === allowedHost;
}
