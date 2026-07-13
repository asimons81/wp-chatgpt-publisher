import { randomUUID } from "node:crypto";

export type ErrorCode =
  | "authentication_required"
  | "connection_expired"
  | "scope_missing"
  | "capability_missing"
  | "validation_error"
  | "edit_conflict"
  | "unsupported"
  | "rate_limited"
  | "upstream_error"
  | "confirmation_required"
  | "confirmation_expired"
  | "security_rejection";
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly remediation?: string,
    public readonly retryable = false,
    public readonly requestId: string = randomUUID(),
  ) {
    super(message);
    this.name = "AppError";
  }
  toSafeObject() {
    return {
      code: this.code,
      message: this.message,
      ...(this.remediation ? { remediation: this.remediation } : {}),
      requestId: this.requestId,
      retryable: this.retryable,
    };
  }
}
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError(
    "upstream_error",
    "The operation could not be completed.",
    502,
    "Retry once, then run the connection diagnostic if the problem continues.",
    true,
  );
}
