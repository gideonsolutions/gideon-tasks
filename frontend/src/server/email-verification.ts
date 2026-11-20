import "server-only";
import { execute, queryOne } from "./db";
import { newId } from "./auth";
import { logAudit } from "./audit";
import { siteUrl } from "./env";
import { sendVerificationEmail } from "./email";
import { badRequest, forbidden, rateLimited } from "./errors";
import {
  generateVerificationToken,
  hashVerificationToken,
  isWellFormedVerificationToken,
  verificationExpiresAt,
  verificationTokenState,
} from "./verification-token";
import { registrationDecision, verificationEmailDecision } from "./abuse-limits";

const EMAIL_ISSUED_ACTION = "user.verification_email_issued";

// ─── Abuse limits ────────────────────────────────────────

async function countAuditFromIp(action: string, ip: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM audit_log
     WHERE action = $1 AND ip_address = $2::inet AND created_at > now() - interval '1 hour'`,
    [action, ip],
  );
  return row?.count ?? 0;
}

/** Per-IP limit on open sign-ups. */
export async function enforceRegistrationLimit(ip: string | null): Promise<void> {
  const fromIp = ip ? await countAuditFromIp("user.registered", ip) : null;
  const decision = registrationDecision(fromIp);
  if (!decision.allowed) throw rateLimited(decision.reason);
}

/** Per-account and per-IP limits on verification emails. */
export async function enforceVerificationEmailLimits(
  userId: string,
  ip: string | null,
): Promise<void> {
  const stats = await queryOne<{ seconds_since_last: number | null; last_day: number }>(
    `SELECT FLOOR(EXTRACT(EPOCH FROM now() - MAX(created_at)))::int AS seconds_since_last,
            (COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours'))::int AS last_day
     FROM email_verifications WHERE user_id = $1`,
    [userId],
  );
  const decision = verificationEmailDecision({
    secondsSinceLast: stats?.seconds_since_last ?? null,
    sentToAccountLastDay: stats?.last_day ?? 0,
    fromIpLastHour: ip ? await countAuditFromIp(EMAIL_ISSUED_ACTION, ip) : null,
  });
  if (!decision.allowed) throw rateLimited(decision.reason);
}

// ─── Issuing and consuming links ─────────────────────────

/**
 * Creates a single-use token (stored hashed) and emails the link. Callers
 * apply the abuse limits first.
 */
export async function issueVerificationEmail(
  user: { id: string; email: string },
  ip: string | null,
): Promise<void> {
  const { token, tokenHash } = generateVerificationToken();
  await execute(
    `INSERT INTO email_verifications (id, user_id, token_hash, created_at, expires_at)
     VALUES ($1, $2, $3, now(), $4)`,
    [newId(), user.id, tokenHash, verificationExpiresAt(new Date())],
  );
  await logAudit(user.id, EMAIL_ISSUED_ACTION, "user", user.id, null, null, ip);
  await sendVerificationEmail(
    user.email,
    siteUrl(`/verify-email?token=${encodeURIComponent(token)}`),
  );
}

export type VerifyOutcome = "verified" | "already_verified";

const INVALID_LINK =
  "This verification link is not valid. Check that you copied the whole link, or sign in and ask for a new one.";

export async function consumeVerificationToken(token: string): Promise<VerifyOutcome> {
  if (!isWellFormedVerificationToken(token)) throw badRequest(INVALID_LINK);
  const tokenHash = hashVerificationToken(token);

  // Marking the token used and the email verified happens in one statement,
  // so a token can only ever be redeemed once.
  const verified = await queryOne<{ id: string }>(
    `WITH consumed AS (
       UPDATE email_verifications SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id
     )
     UPDATE users SET email_verified = true, updated_at = now()
     FROM consumed WHERE users.id = consumed.user_id
     RETURNING users.id`,
    [tokenHash],
  );

  if (verified) {
    // Retire any other outstanding links for this account.
    await execute(
      `UPDATE email_verifications SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
      [verified.id],
    );
    await logAudit(
      verified.id,
      "user.email_verified",
      "user",
      verified.id,
      { email_verified: false },
      { email_verified: true },
    );
    return "verified";
  }

  const row = await queryOne<{
    expires_at: string;
    used_at: string | null;
    email_verified: boolean;
  }>(
    `SELECT ev.expires_at, ev.used_at, u.email_verified
     FROM email_verifications ev JOIN users u ON u.id = ev.user_id
     WHERE ev.token_hash = $1`,
    [tokenHash],
  );
  if (!row) throw badRequest(INVALID_LINK);
  // Link scanners sometimes open links before the person does; a second
  // click on a redeemed link should not look like a failure.
  if (row.email_verified) return "already_verified";
  if (verificationTokenState(row) === "expired") {
    throw badRequest("This verification link has expired. Sign in and ask for a new one.");
  }
  throw badRequest("This verification link has already been used. Sign in and ask for a new one.");
}

// ─── Gating ──────────────────────────────────────────────

export type VerifiedAction = "post" | "apply" | "pay" | "payouts";

const VERIFY_FIRST: Record<VerifiedAction, string> = {
  post: "Confirm your email address before posting tasks. Open the link we emailed you, or ask for a new one from your dashboard.",
  apply: "Confirm your email address before applying for tasks. Open the link we emailed you, or ask for a new one from your dashboard.",
  pay: "Confirm your email address before adding a payment card. Open the link we emailed you, or ask for a new one from your dashboard.",
  payouts: "Confirm your email address before setting up payouts. Open the link we emailed you, or ask for a new one from your dashboard.",
};

/**
 * Reads the verification flag from the database (it is not in the JWT) and
 * throws 403 if the email is not confirmed. Returns true for convenience.
 *
 * Card and payout setup are gated too, so payment details are only ever
 * attached to an account whose email address has been proven (an account
 * registered with somebody else's address cannot collect payouts or hold a
 * card on it).
 */
export async function requireVerifiedEmail(
  userId: string,
  action: VerifiedAction,
): Promise<true> {
  const row = await queryOne<{ email_verified: boolean }>(
    `SELECT email_verified FROM users WHERE id = $1`,
    [userId],
  );
  if (!row?.email_verified) throw forbidden(VERIFY_FIRST[action]);
  return true;
}
