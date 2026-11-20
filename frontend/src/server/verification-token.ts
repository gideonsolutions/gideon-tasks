import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Single-use email link tokens: 32 random bytes, sent hex-encoded in the
 * link, stored only as a SHA-256 hash, usable once. Email verification links
 * are valid for 24 hours; password reset links use the same token format and
 * are valid for 1 hour.
 *
 * Kept free of DB and env imports so the rules can be unit tested.
 */

export const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
export const EMAIL_VERIFICATION_TTL_HOURS = 24;
export const EMAIL_VERIFICATION_TTL_MS = EMAIL_VERIFICATION_TTL_HOURS * 3_600_000;

export const PASSWORD_RESET_TTL_MINUTES = 60;
export const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TTL_MINUTES * 60_000;

const TOKEN_PATTERN = new RegExp(`^[0-9a-f]{${EMAIL_VERIFICATION_TOKEN_BYTES * 2}}$`);

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("hex");
  return { token, tokenHash: hashVerificationToken(token) };
}

/** Cheap shape check before touching the database. */
export function isWellFormedVerificationToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function verificationExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + EMAIL_VERIFICATION_TTL_MS);
}

export function passwordResetExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + PASSWORD_RESET_TTL_MS);
}

export type VerificationTokenState = "valid" | "used" | "expired";

export function verificationTokenState(
  row: { expires_at: Date | string; used_at: Date | string | null },
  now: Date = new Date(),
): VerificationTokenState {
  if (row.used_at) return "used";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "valid";
}
