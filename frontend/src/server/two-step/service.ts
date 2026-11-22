import "server-only";
import QRCode from "qrcode";
import { queryOne, execute } from "../db";
import { badRequest, conflict, notFound, rateLimited, twoStepRequired } from "../errors";
import { logAudit } from "../audit";
import { newId, verifyPassword, type AuthUser } from "../auth";
import { openSecret, sealSecret, twoStepAvailable } from "./secret-box";
import {
  checkTotp,
  hashRecoveryCode,
  lockDurationMs,
  looksLikeTotp,
  newRecoveryCodes,
  newTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  totpKeyForTyping,
} from "./totp";

// Two-step sign-in: after the password, a code from an authenticator app or
// a single-use recovery code. Required for admins and for anyone who uploads,
// lists, downloads or deletes a task document or a preparer proof
// (requireTwoStep, below); anyone else may turn it on.
//
// Why. The FTC Safeguards Rule, 16 CFR 314.4(c)(5): "Implement multi-factor
// authentication for any individual accessing any information system";
//   https://www.ecfr.gov/current/title-16/section-314.4
// IRS Publication 4557 (Rev. 6-2024) explains it for tax preparers: the
// rule "requires at least two of these following authentication factors".
//   https://www.irs.gov/pub/irs-pdf/p4557.pdf
// This is the platform's own control on its own sign-in; it doesn't make
// anyone compliant.
//
// Nothing here writes a secret or a code to the logs or the audit log.
// A wrong password or code is a 400, not a 401, so the browser doesn't take
// it as an expired session and sign the user out of the settings page.

export const TWO_STEP_ISSUER = "Gideon Tasks";

export const WRONG_CODE =
  "That code isn't right. Enter the code your app shows now, or one of your recovery codes";

export const SET_UP_FIRST =
  "Set up two-step sign-in first. Go to /profile/security, then sign in again";

export const SIGN_IN_AGAIN =
  "Sign out and sign in again with your two-step code to do this";

interface TwoStepRow {
  id: string;
  email: string;
  password_hash: string;
  totp_secret_enc: string | null;
  totp_enabled_at: string | null;
  totp_last_step: number | string;
  totp_failures: number;
  totp_locked_until: string | null;
}

async function loadRow(userId: string): Promise<TwoStepRow> {
  const row = await queryOne<TwoStepRow>(
    `SELECT id, email, password_hash, totp_secret_enc, totp_enabled_at, totp_last_step,
            totp_failures, totp_locked_until
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!row) throw notFound("User not found");
  return row;
}

function requireAvailable(): void {
  if (!twoStepAvailable()) throw badRequest("Two-step sign-in isn't available yet");
}

async function checkPassword(row: TwoStepRow, password: string): Promise<void> {
  if (!(await verifyPassword(password, row.password_hash))) {
    throw badRequest("Your password is not correct");
  }
}

async function recoveryCodesLeft(userId: string): Promise<number> {
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
  return r?.n ?? 0;
}

// ─── Enforcement ─────────────────────────────────────────

/**
 * Throws 403 two_step_required unless this session passed two-step sign-in
 * and the account still has it on. Used on every document, proof and
 * document-admin route.
 */
export async function requireTwoStep(auth: AuthUser): Promise<void> {
  const row = await queryOne<{ totp_enabled_at: string | null }>(
    `SELECT totp_enabled_at FROM users WHERE id = $1`,
    [auth.userId],
  );
  if (!row?.totp_enabled_at) throw twoStepRequired(SET_UP_FIRST);
  if (!auth.mfa) throw twoStepRequired(SIGN_IN_AGAIN);
}

// ─── Status and setting up ───────────────────────────────

export interface TwoStepStatus {
  available: boolean;
  enabled: boolean;
  enabled_at: string | null;
  setup_in_progress: boolean;
  recovery_codes_left: number;
}

export async function twoStepStatus(userId: string): Promise<TwoStepStatus> {
  const row = await loadRow(userId);
  const enabled = row.totp_enabled_at != null;
  return {
    available: twoStepAvailable(),
    enabled,
    enabled_at: row.totp_enabled_at,
    setup_in_progress: !enabled && row.totp_secret_enc != null,
    recovery_codes_left: enabled ? await recoveryCodesLeft(userId) : 0,
  };
}

/**
 * Makes a new secret for the user's app and returns what the app needs (a
 * QR code and the key to type). It takes effect only once enable() confirms
 * a code from it.
 */
export async function startSetup(userId: string): Promise<{ key: string; otpauth_uri: string; qr_svg: string }> {
  requireAvailable();
  const row = await loadRow(userId);
  if (row.totp_enabled_at) throw conflict("Two-step sign-in is already on");
  const secret = newTotpSecret();
  await execute(
    `UPDATE users SET totp_secret_enc = $1, totp_enabled_at = NULL, totp_last_step = 0,
       totp_failures = 0, totp_locked_until = NULL, updated_at = now()
     WHERE id = $2`,
    [sealSecret(userId, secret), userId],
  );
  const uri = otpauthUri(TWO_STEP_ISSUER, row.email, secret);
  const qr_svg = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return { key: totpKeyForTyping(secret), otpauth_uri: uri, qr_svg };
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = newRecoveryCodes();
  await execute(`DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [userId]);
  for (const c of codes) {
    await execute(
      `INSERT INTO mfa_recovery_codes (id, user_id, code_hash, created_at) VALUES ($1, $2, $3, now())`,
      [newId(), userId, hashRecoveryCode(c)],
    );
  }
  return codes;
}

/**
 * Turns two-step sign-in on once the user shows they have the secret (the
 * password and a code from it), and returns their 10 recovery codes, shown
 * only now.
 */
export async function enable(userId: string, password: string, code: string, now = new Date()): Promise<string[]> {
  requireAvailable();
  const row = await loadRow(userId);
  await checkPassword(row, password);
  if (row.totp_enabled_at) throw conflict("Two-step sign-in is already on");
  if (!row.totp_secret_enc) throw badRequest("Start setting up two-step sign-in first");
  const step = checkTotp(openSecret(userId, row.totp_secret_enc), code, now, 0);
  if (step == null) {
    throw badRequest(
      "That code doesn't match. Check that your phone sets its clock automatically, and enter the code your app shows now",
    );
  }
  await execute(
    `UPDATE users SET totp_enabled_at = now(), totp_last_step = $1, totp_failures = 0,
       totp_locked_until = NULL, updated_at = now()
     WHERE id = $2`,
    [step, userId],
  );
  const codes = await replaceRecoveryCodes(userId);
  await logAudit(userId, "user.two_step.enabled", "user", userId, null, { recovery_codes: codes.length });
  return codes;
}

// ─── Checking a second factor ────────────────────────────

export type SecondFactorResult = { ok: true; method: "totp" | "recovery"; recovery_codes_left?: number };

/**
 * Checks an app code or a recovery code for an account with two-step sign-in
 * on, and uses it up: an app code's step is recorded so it can't be used
 * again, a recovery code is marked used. A wrong code counts toward the
 * lockout; a locked account is refused without checking the code.
 */
export async function checkSecondFactor(userId: string, code: string, now = new Date()): Promise<SecondFactorResult> {
  const row = await loadRow(userId);
  if (!row.totp_enabled_at || !row.totp_secret_enc) throw badRequest("Two-step sign-in is not on");
  if (row.totp_locked_until && new Date(row.totp_locked_until) > now) {
    throw rateLimited(
      `Too many wrong codes. Try again after ${new Date(row.totp_locked_until).toISOString().slice(11, 16)} UTC`,
    );
  }

  if (looksLikeTotp(code)) {
    const step = checkTotp(openSecret(userId, row.totp_secret_enc), code, now, Number(row.totp_last_step));
    if (step != null) {
      // Only advance: a concurrent use of the same code finds the step taken.
      const used = await queryOne<{ id: string }>(
        `UPDATE users SET totp_last_step = $1, totp_failures = 0, totp_locked_until = NULL
         WHERE id = $2 AND totp_last_step < $1 RETURNING id`,
        [step, userId],
      );
      if (used) return { ok: true, method: "totp" };
    }
  } else if (normalizeRecoveryCode(code).length > 0) {
    const used = await queryOne<{ id: string }>(
      `UPDATE mfa_recovery_codes SET used_at = now()
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id`,
      [userId, hashRecoveryCode(code)],
    );
    if (used) {
      await execute(`UPDATE users SET totp_failures = 0, totp_locked_until = NULL WHERE id = $1`, [userId]);
      const left = await recoveryCodesLeft(userId);
      await logAudit(userId, "user.two_step.recovery_code_used", "user", userId, null, { recovery_codes_left: left });
      return { ok: true, method: "recovery", recovery_codes_left: left };
    }
  }

  // Wrong: count it, and lock on every fifth.
  const failures = row.totp_failures + 1;
  const lockMs = lockDurationMs(failures);
  const lockedUntil = lockMs ? new Date(now.getTime() + lockMs) : null;
  await execute(
    `UPDATE users SET totp_failures = $1, totp_locked_until = COALESCE($2, totp_locked_until) WHERE id = $3`,
    [failures, lockedUntil, userId],
  );
  await logAudit(userId, "user.two_step.failed", "user", userId, null, { failures });
  if (lockedUntil) {
    await logAudit(null, "user.two_step.locked", "user", userId, null, {
      failures,
      locked_until: lockedUntil.toISOString(),
      minutes: lockMs / 60_000,
    });
    throw rateLimited(
      `Too many wrong codes. Try again after ${lockedUntil.toISOString().slice(11, 16)} UTC`,
    );
  }
  throw badRequest(WRONG_CODE);
}

// ─── Turning it off, replacing codes, admin reset ────────

async function clearTwoStep(userId: string): Promise<void> {
  await execute(
    `UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = 0,
       totp_failures = 0, totp_locked_until = NULL, updated_at = now()
     WHERE id = $1`,
    [userId],
  );
  await execute(`DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [userId]);
}

/** Turns it off: needs the password and a current code (or a recovery code). */
export async function disable(userId: string, password: string, code: string, now = new Date()): Promise<void> {
  const row = await loadRow(userId);
  await checkPassword(row, password);
  if (!row.totp_enabled_at) throw badRequest("Two-step sign-in is not on");
  await checkSecondFactor(userId, code, now);
  await clearTwoStep(userId);
  await logAudit(userId, "user.two_step.disabled", "user", userId, null, { by: "user" });
}

/** Replaces every recovery code, used or not: needs the password and a code. */
export async function regenerateRecoveryCodes(
  userId: string,
  password: string,
  code: string,
  now = new Date(),
): Promise<string[]> {
  const row = await loadRow(userId);
  await checkPassword(row, password);
  if (!row.totp_enabled_at) throw badRequest("Two-step sign-in is not on");
  await checkSecondFactor(userId, code, now);
  const codes = await replaceRecoveryCodes(userId);
  await logAudit(userId, "user.two_step.recovery_codes_replaced", "user", userId, null, {
    recovery_codes: codes.length,
  });
  return codes;
}

/** What an admin sees about a user's two-step sign-in. */
export async function adminTwoStepView(userId: string) {
  const row = await loadRow(userId);
  const u = await queryOne<{ legal_first_name: string; legal_last_name: string; status: string }>(
    `SELECT legal_first_name, legal_last_name, status FROM users WHERE id = $1`,
    [userId],
  );
  return {
    id: row.id,
    email: row.email,
    legal_first_name: u?.legal_first_name ?? "",
    legal_last_name: u?.legal_last_name ?? "",
    status: u?.status ?? "",
    enabled: row.totp_enabled_at != null,
    enabled_at: row.totp_enabled_at,
    failures: row.totp_failures,
    locked_until: row.totp_locked_until,
    recovery_codes_left: row.totp_enabled_at ? await recoveryCodesLeft(userId) : 0,
  };
}

/**
 * Turns two-step sign-in off for someone who lost both their app and their
 * recovery codes, once an admin has confirmed who they are another way.
 * Never self-service: an admin can't reset their own. It unlocks the
 * account and signs the user out everywhere, and is audited with the note.
 */
export async function adminReset(admin: AuthUser, userId: string, note: string): Promise<void> {
  if (admin.userId === userId) {
    throw badRequest("You can't reset your own two-step sign-in. Turn it off with your password and a code");
  }
  const row = await loadRow(userId);
  if (!row.totp_enabled_at && !row.totp_secret_enc) throw badRequest("Two-step sign-in is not on for this account");
  const wasEnabled = row.totp_enabled_at != null;
  await clearTwoStep(userId);
  await execute(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
  await logAudit(
    admin.userId,
    "admin.user.two_step_reset",
    "user",
    userId,
    { enabled: wasEnabled },
    { enabled: false, note },
  );
}
