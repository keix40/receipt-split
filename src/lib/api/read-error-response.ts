/** Parse JSON or HTML error bodies from API routes into a user-facing message. */
export async function readApiErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) return body.error;
  } else {
    const text = await res.text().catch(() => "");
    if (text.trimStart().startsWith("<")) {
      if (res.status === 504 || res.status === 502) {
        return "Reading the receipt timed out or failed on the server. Try again with a clearer photo.";
      }
      return "The server returned an unexpected error. Please try again.";
    }
    if (text) return text.slice(0, 200);
  }

  if (res.status === 429) return "Too many requests. Please wait a moment and try again.";
  if (res.status === 403) return "This action is not allowed from your browser session.";
  if (res.status === 504 || res.status === 502) {
    return "Reading the receipt timed out or failed. Try again with a clearer photo.";
  }
  return `Something went wrong (${res.status}).`;
}
