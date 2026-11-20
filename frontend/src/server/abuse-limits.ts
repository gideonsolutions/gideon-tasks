import "server-only";
import { isIP } from "node:net";

/**
 * Modest, database-backed limits on sign-ups and verification emails.
 *
 * Counts come from rows the app already writes:
 *  - registrations per IP: `audit_log` rows with action 'user.registered'
 *  - verification emails per IP: `audit_log` rows with action
 *    'user.verification_email_issued'
 *  - verification emails per account (one account per email address):
 *    `email_verifications` rows for that user
 *
 * This module only holds the numbers and the decisions so they can be unit
 * tested; the queries live in src/server/email-verification.ts.
 */

/** Sign-ups without an invite from one IP address, per rolling hour. */
export const REGISTRATIONS_PER_IP_PER_HOUR = 10;
/** Minimum gap between verification emails to one account. */
export const VERIFICATION_EMAIL_MIN_INTERVAL_SECS = 60;
/** Verification emails to one account, per rolling 24 hours. */
export const VERIFICATION_EMAILS_PER_ACCOUNT_PER_DAY = 5;
/** Verification emails requested from one IP address, per rolling hour. */
export const VERIFICATION_EMAILS_PER_IP_PER_HOUR = 20;

export type LimitDecision = { allowed: true } | { allowed: false; reason: string };

const ALLOWED: LimitDecision = { allowed: true };

/** `fromIpLastHour` is null when the client IP is unknown (local dev). */
export function registrationDecision(fromIpLastHour: number | null): LimitDecision {
  if (fromIpLastHour !== null && fromIpLastHour >= REGISTRATIONS_PER_IP_PER_HOUR) {
    return {
      allowed: false,
      reason: "Too many accounts have been created from this network recently. Try again in an hour.",
    };
  }
  return ALLOWED;
}

export function verificationEmailDecision(input: {
  /** Seconds since the last verification email to this account, or null if none. */
  secondsSinceLast: number | null;
  /** Verification emails to this account in the last 24 hours. */
  sentToAccountLastDay: number;
  /** Verification emails requested from this IP in the last hour, or null if unknown. */
  fromIpLastHour: number | null;
}): LimitDecision {
  if (
    input.secondsSinceLast !== null &&
    input.secondsSinceLast < VERIFICATION_EMAIL_MIN_INTERVAL_SECS
  ) {
    const wait = Math.max(1, Math.ceil(VERIFICATION_EMAIL_MIN_INTERVAL_SECS - input.secondsSinceLast));
    return {
      allowed: false,
      reason: `We just sent you an email. Wait ${wait} second${wait === 1 ? "" : "s"} before asking for another.`,
    };
  }
  if (input.sentToAccountLastDay >= VERIFICATION_EMAILS_PER_ACCOUNT_PER_DAY) {
    return {
      allowed: false,
      reason: "You have asked for several verification emails today. Check your spam folder, or try again tomorrow.",
    };
  }
  if (input.fromIpLastHour !== null && input.fromIpLastHour >= VERIFICATION_EMAILS_PER_IP_PER_HOUR) {
    return {
      allowed: false,
      reason: "Too many verification emails have been requested from this network recently. Try again in an hour.",
    };
  }
  return ALLOWED;
}

/**
 * Client IP for rate limiting. On Vercel, `x-real-ip` and the first
 * `x-forwarded-for` entry are set by the platform. Returns null when no
 * valid address is present (for example in local development), in which case
 * per-IP limits are skipped.
 */
export function clientIp(req: Request): string | null {
  const candidates = [
    req.headers.get("x-real-ip"),
    req.headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const raw of candidates) {
    const ip = raw?.trim();
    if (ip && isIP(ip) !== 0) return ip;
  }
  return null;
}
