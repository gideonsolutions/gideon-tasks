import "server-only";
import { execute, query, queryOne } from "./db";
import { hashPassword, newId } from "./auth";
import { logAudit } from "./audit";
import { env, siteUrl } from "./env";
import { sendPasswordResetEmail } from "./email";
import { badRequest, rateLimited } from "./errors";
import {
  generateVerificationToken,
  hashVerificationToken,
  isWellFormedVerificationToken,
  PASSWORD_RESET_TTL_MINUTES,
  passwordResetExpiresAt,
  verificationTokenState,
} from "./verification-token";
import { passwordResetEmailDecision, passwordResetRequestDecision } from "./abuse-limits";

/**
 * "Forgot password", following the email-verification pattern: a single-use
 * 32-byte token, stored only as its SHA-256 hash, valid for 1 hour.
 *
 * The request endpoint never reveals whether an address has an account:
 *  - it answers every well-formed request the same way;
 *  - the only visible limit is per IP and counts every request;
 *  - the account lookup, the per-account limits and the email all run after
 *    the response has been sent (next/server `after`), so timing is the same
 *    whether or not the address has an account.
 */

export const RESET_REQUESTED_ACTION = "user.password_reset_requested";
export const RESET_EMAIL_ISSUED_ACTION = "user.password_reset_email_issued";
export const PASSWORD_RESET_ACTION = "user.password_reset";

/** The one answer to every well-formed "forgot password" request. */
export const FORGOT_PASSWORD_MESSAGE = `If an account uses that email address, we have sent it a link to reset the password. The link works once and expires in ${PASSWORD_RESET_TTL_MINUTES} minutes. If nothing arrives in a few minutes, check your spam folder.`;

// ─── Requesting a link ───────────────────────────────────

async function requestsFromIpLastHour(ip: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM audit_log
     WHERE action = $1 AND ip_address = $2::inet AND created_at > now() - interval '1 hour'`,
    [RESET_REQUESTED_ACTION, ip],
  );
  return row?.count ?? 0;
}

/** Per-IP limit (429), the same for addresses with and without accounts. */
export async function enforcePasswordResetRequestLimit(ip: string | null): Promise<void> {
  const decision = passwordResetRequestDecision(ip ? await requestsFromIpLastHour(ip) : null);
  if (!decision.allowed) throw rateLimited(decision.reason);
}

/**
 * Counts the request for the per-IP limit. Written for every request, with
 * no account and no address, so it is identical either way.
 */
export async function recordPasswordResetRequest(ip: string | null): Promise<void> {
  await logAudit(null, RESET_REQUESTED_ACTION, "password_reset_request", newId(), null, null, ip);
}

/**
 * Emails a reset link if the address belongs to an active account and the
 * per-account limits allow it; otherwise does nothing. Runs after the
 * response, so its outcome never reaches the requester.
 */
export async function sendPasswordResetIfAccountExists(
  email: string,
  ip: string | null,
): Promise<"sent" | "no_account" | "inactive" | "limited"> {
  const user = await queryOne<{ id: string; email: string; status: string }>(
    `SELECT id, email, status FROM users WHERE lower(email) = lower($1)
     ORDER BY created_at LIMIT 1`,
    [email],
  );
  if (!user) return "no_account";
  if (user.status !== "active") return "inactive";

  const stats = await queryOne<{ seconds_since_last: number | null; last_day: number }>(
    `SELECT FLOOR(EXTRACT(EPOCH FROM now() - MAX(created_at)))::int AS seconds_since_last,
            (COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours'))::int AS last_day
     FROM password_resets WHERE user_id = $1`,
    [user.id],
  );
  const decision = passwordResetEmailDecision({
    secondsSinceLast: stats?.seconds_since_last ?? null,
    sentToAccountLastDay: stats?.last_day ?? 0,
  });
  if (!decision.allowed) return "limited";

  const { token, tokenHash } = generateVerificationToken();
  await execute(
    `INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at)
     VALUES ($1, $2, $3, now(), $4)`,
    [newId(), user.id, tokenHash, passwordResetExpiresAt(new Date())],
  );
  await logAudit(user.id, RESET_EMAIL_ISSUED_ACTION, "user", user.id, null, null, ip);
  // Send to the address on the account, not the one typed in the form.
  await sendPasswordResetEmail(
    user.email,
    siteUrl(`/reset-password?token=${encodeURIComponent(token)}`),
  );
  return "sent";
}

// ─── Using a link ────────────────────────────────────────

const INVALID_LINK =
  "This password reset link is not valid. Check that you copied the whole link, or ask for a new one.";
const EXPIRED_LINK = "This password reset link has expired. Ask for a new one.";
const USED_LINK = "This password reset link has already been used. Ask for a new one if you need to.";

export interface ResetOutcome {
  userId: string;
  sessionsRevoked: number;
}

/**
 * Sets a new password from a reset link, then:
 *  - retires the account's other outstanding reset links;
 *  - marks the email verified (opening the link proves control of the
 *    inbox, which lets the real owner recover an account someone else
 *    registered with their address);
 *  - deletes every refresh token, so no existing session can be renewed.
 *    Access tokens are stateless JWTs and stop working when they expire
 *    (JWT_ACCESS_EXPIRY_SECS, 15 minutes by default).
 */
export async function resetPassword(token: string, newPassword: string): Promise<ResetOutcome> {
  if (!isWellFormedVerificationToken(token)) throw badRequest(INVALID_LINK);
  const tokenHash = hashVerificationToken(token);

  const row = await queryOne<{
    user_id: string;
    expires_at: string;
    used_at: string | null;
    email_verified: boolean;
  }>(
    `SELECT pr.user_id, pr.expires_at, pr.used_at, u.email_verified
     FROM password_resets pr JOIN users u ON u.id = pr.user_id
     WHERE pr.token_hash = $1`,
    [tokenHash],
  );
  if (!row) throw badRequest(INVALID_LINK);
  const tokenState = verificationTokenState(row);
  if (tokenState === "used") throw badRequest(USED_LINK);
  if (tokenState === "expired") throw badRequest(EXPIRED_LINK);

  // Hash only once the link is known to be good (bcrypt is deliberately slow).
  const passwordHash = await hashPassword(newPassword);

  // Consuming the token and changing the password happen in one statement,
  // so a link can only ever be used once, even by two requests at once.
  const updated = await queryOne<{ id: string }>(
    `WITH consumed AS (
       UPDATE password_resets SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id
     )
     UPDATE users SET password_hash = $2, email_verified = true, updated_at = now()
     FROM consumed WHERE users.id = consumed.user_id
     RETURNING users.id`,
    [tokenHash, passwordHash],
  );
  if (!updated) throw badRequest(USED_LINK);

  await execute(
    `UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
    [updated.id],
  );
  const revoked = await query<{ id: string }>(
    `DELETE FROM refresh_tokens WHERE user_id = $1 RETURNING id`,
    [updated.id],
  );

  await logAudit(
    updated.id,
    PASSWORD_RESET_ACTION,
    "user",
    updated.id,
    { email_verified: row.email_verified },
    { email_verified: true, sessions_revoked: revoked.length },
  );
  return { userId: updated.id, sessionsRevoked: revoked.length };
}

/** How long a stolen access token keeps working after a reset, in minutes. */
export function accessTokenLifetimeMinutes(): number {
  return Math.max(1, Math.ceil(env.jwtAccessExpirySecs / 60));
}
