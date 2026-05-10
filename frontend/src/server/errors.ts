import "server-only";
import { NextResponse } from "next/server";

type ErrorKind =
  | "not_found"
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "rate_limited"
  | "content_rejected"
  | "content_flagged"
  | "invalid_transition"
  | "payment_error"
  | "trust_level_insufficient"
  | "internal";

const STATUS: Record<ErrorKind, number> = {
  not_found: 404,
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  conflict: 409,
  rate_limited: 429,
  content_rejected: 422,
  content_flagged: 202,
  invalid_transition: 409,
  payment_error: 400,
  trust_level_insufficient: 403,
  internal: 500,
};

export class AppError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
  ) {
    super(message);
  }
  get status(): number {
    return STATUS[this.kind];
  }
}

export const notFound = (msg: string) => new AppError("not_found", msg);
export const badRequest = (msg: string) => new AppError("bad_request", msg);
export const unauthorized = (msg: string) => new AppError("unauthorized", msg);
export const forbidden = (msg: string) => new AppError("forbidden", msg);
export const conflict = (msg: string) => new AppError("conflict", msg);
export const contentRejected = (msg: string) =>
  new AppError("content_rejected", msg);
export const contentFlagged = (msg: string) =>
  new AppError("content_flagged", msg);
export const invalidTransition = (msg: string) =>
  new AppError("invalid_transition", msg);
export const paymentError = (msg: string) => new AppError("payment_error", msg);
export const trustLevelInsufficient = (msg: string) =>
  new AppError("trust_level_insufficient", msg);

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("Internal error:", err);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    return errorResponse(err);
  }
}
