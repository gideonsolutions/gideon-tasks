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
 *  - password reset requests per IP: `audit_log` rows with action
 *    'user.password_reset_requested', written for every request whether or
 *    not the address has an account, so the limit reveals nothing
 *  - password reset emails per account: `password_resets` rows for that user
 *
 * This module only holds the numbers and the decisions so they can be unit
 * tested; the queries live in src/server/email-verification.ts and
 * src/server/password-reset.ts.
 */

/** Sign-ups without an invite from one IP address, per rolling hour. */
export const REGISTRATIONS_PER_IP_PER_HOUR = 10;
/** Minimum gap between verification emails to one account. */
export const VERIFICATION_EMAIL_MIN_INTERVAL_SECS = 60;
/** Verification emails to one account, per rolling 24 hours. */
export const VERIFICATION_EMAILS_PER_ACCOUNT_PER_DAY = 5;
/** Verification emails requested from one IP address, per rolling hour. */
export const VERIFICATION_EMAILS_PER_IP_PER_HOUR = 20;
/** Minimum gap between password reset emails to one account. */
export const PASSWORD_RESET_EMAIL_MIN_INTERVAL_SECS = 60;
/** Password reset emails to one account, per rolling 24 hours. */
export const PASSWORD_RESET_EMAILS_PER_ACCOUNT_PER_DAY = 5;
/** Password reset requests from one IP address, per rolling hour. */
export const PASSWORD_RESET_REQUESTS_PER_IP_PER_HOUR = 20;

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
 * Per-IP limit on "forgot password" requests. This is the only limit the
 * requester can see (a 429), and it counts every request from the IP, so it
 * says nothing about whether any address has an account.
 */
export function passwordResetRequestDecision(fromIpLastHour: number | null): LimitDecision {
  if (fromIpLastHour !== null && fromIpLastHour >= PASSWORD_RESET_REQUESTS_PER_IP_PER_HOUR) {
    return {
      allowed: false,
      reason: "Too many password reset requests have come from this network recently. Try again in an hour.",
    };
  }
  return ALLOWED;
}

/**
 * Per-account limits on password reset emails, mirroring the verification
 * email limits. A refusal here is silent: the request still gets the same
 * generic answer, so the limit cannot be used to find out which addresses
 * have accounts.
 */
export function passwordResetEmailDecision(input: {
  /** Seconds since the last reset email to this account, or null if none. */
  secondsSinceLast: number | null;
  /** Reset emails to this account in the last 24 hours. */
  sentToAccountLastDay: number;
}): LimitDecision {
  if (
    input.secondsSinceLast !== null &&
    input.secondsSinceLast < PASSWORD_RESET_EMAIL_MIN_INTERVAL_SECS
  ) {
    return { allowed: false, reason: "A reset email was sent to this account less than a minute ago." };
  }
  if (input.sentToAccountLastDay >= PASSWORD_RESET_EMAILS_PER_ACCOUNT_PER_DAY) {
    return { allowed: false, reason: "This account has had the daily maximum of reset emails." };
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
