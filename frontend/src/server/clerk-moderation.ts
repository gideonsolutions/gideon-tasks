import { moderateContent, type ModerationResult } from "./moderation";

/**
 * Checks a Gideon Clerk booking description. Two narrow checks come first,
 * then the site's usual moderateContent.
 *
 * Social Security numbers: a 3-2-4 number with dashes, dots or spaces, or
 * 9 digits in a row (which also catches most account and routing numbers).
 * This is deliberately small and only used here, so it can be folded into a
 * general SSN rule in moderation.ts when there is one: replace SSN_PATTERNS
 * with that rule and keep the Clerk-specific message.
 *
 * The site's two child rules don't apply here (see ModerationContext.clerkBooking):
 * a child care assistance application is ordinary Clerk paperwork.
 *
 * Passwords and codes: "password: …", "PIN = …" and the like. Gideon Clerk
 * never receives or stores a password, so one in the description is refused
 * rather than saved.
 */
export const SSN_PATTERNS: RegExp[] = [
  /(?<!\d)\d{3}[-.\s]\d{2}[-.\s]\d{4}(?!\d)/,
  /(?<!\d)\d{9}(?!\d)/,
];

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:password|passcode|passphrase|pin|security answer|one[-\s]?time code|verification code)\s*[:=]\s*\S/i,
];

export const CLERK_SENSITIVE_NUMBER_REASON =
  "Remove the long number. Don't put Social Security numbers, account numbers or card numbers in the description; if we need one during the session, you type it yourself.";

export const CLERK_SECRET_REASON =
  "Remove the password or code. Gideon Clerk never asks for, receives or stores passwords, security answers or one-time codes; you type them yourself during the session.";

export function moderateClerkDescription(text: string): ModerationResult {
  for (const p of SSN_PATTERNS) {
    if (p.test(text)) return { kind: "rejected", reason: CLERK_SENSITIVE_NUMBER_REASON };
  }
  for (const p of SECRET_PATTERNS) {
    if (p.test(text)) return { kind: "rejected", reason: CLERK_SECRET_REASON };
  }
  return moderateContent(text, { clerkBooking: true });
}
