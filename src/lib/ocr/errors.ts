export class OcrError extends Error {
  constructor(
    message: string,
    readonly code: "TIMEOUT" | "BILLING" | "FALLBACK_FAILED" | "UNAVAILABLE",
  ) {
    super(message);
    this.name = "OcrError";
  }
}

export function isOcrError(error: unknown): error is OcrError {
  return error instanceof OcrError;
}
