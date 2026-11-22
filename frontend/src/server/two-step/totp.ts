import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Two-step sign-in uses time-based one-time passwords (RFC 6238) as every
// authenticator app implements them: HMAC-SHA1, six digits, 30-second
// steps, from a 160-bit secret, accepting one step of clock drift either
// way. A code can't be used twice: its step must be later than the last one
// used. Recovery codes let someone sign in without the app, once each.
//   https://www.rfc-editor.org/rfc/rfc6238 (and RFC 4226 for HOTP)

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECS = 30;
/** Steps either side of now that are accepted, for clock drift. */
export const TOTP_SKEW_STEPS = 1;
const SECRET_BYTES = 20;

export const RECOVERY_CODE_COUNT = 10;

// ─── Base32 (RFC 4648, no padding), as authenticator apps read keys ─────

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Not base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ─── Secrets ─────────────────────────────────────────────

export function newTotpSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

/** The secret as people type it into an app: base32 in groups of four. */
export function totpKeyForTyping(secret: Uint8Array): string {
  return base32Encode(secret).match(/.{1,4}/g)!.join(" ");
}

/** The otpauth:// address an authenticator app reads from a QR code. */
export function otpauthUri(issuer: string, account: string, secret: Uint8Array): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const q = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECS),
  });
  return `otpauth://totp/${label}?${q.toString()}`;
}

// ─── Codes ───────────────────────────────────────────────

/** The time step for a moment: whole periods since the Unix epoch. */
export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECS);
}

/**
 * HOTP (RFC 4226, section 5.3): HMAC of the 8-byte counter, dynamic
 * truncation, then the low `digits` decimal digits. The algorithm is a
 * parameter only so the RFC 6238 test vectors (SHA-256, SHA-512) can run.
 */
export function hotp(
  secret: Uint8Array,
  counter: number,
  digits = TOTP_DIGITS,
  algorithm: "sha1" | "sha256" | "sha512" = "sha1",
): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secret).update(msg).digest();
  const off = mac[mac.length - 1] & 0x0f;
  const n = mac.readUInt32BE(off) & 0x7fffffff;
  return String(n % 10 ** digits).padStart(digits, "0");
}

/** The code an authenticator app shows at `now`. */
export function totpCode(secret: Uint8Array, now: Date): string {
  return hotp(secret, totpStep(now));
}

/** Whether what someone typed is shaped like an app's code rather than a recovery code. */
export function looksLikeTotp(code: string): boolean {
  return /^\d{6}$/.test(code.replace(/\s/g, ""));
}

/**
 * Checks a code at `now`, within one step either way, and only if its step
 * is later than `lastStep`. Returns the step to record, or null.
 */
export function checkTotp(secret: Uint8Array, code: string, now: Date, lastStep: number): number | null {
  const typed = code.replace(/\s/g, "");
  if (!looksLikeTotp(typed)) return null;
  const cur = totpStep(now);
  for (let step = cur - TOTP_SKEW_STEPS; step <= cur + TOTP_SKEW_STEPS; step++) {
    if (step <= lastStep) continue;
    const want = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(want, Buffer.from(typed))) return step;
  }
  return null;
}

// ─── Recovery codes ──────────────────────────────────────

/** No 0/o or 1/l/i, so codes read back clearly. */
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Codes like "k7m2-q9wf-d3xp-a8bn": 16 characters from 31, about 79 bits,
 * too random to guess from their hash, so a plain hash is stored.
 */
export function newRecoveryCodes(n = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: n }, () => {
    const buf = randomBytes(16);
    let s = "";
    buf.forEach((b, i) => {
      if (i > 0 && i % 4 === 0) s += "-";
      s += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
    });
    return s;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, "");
}

/** The stored form of a recovery code. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(`gideon-tasks-recovery\0${normalizeRecoveryCode(code)}`)
    .digest("hex");
}

// ─── Lockout ─────────────────────────────────────────────

/** Every this many wrong codes lock the account. */
export const LOCK_EVERY_FAILURES = 5;
const FIRST_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

/**
 * How long the account is locked after this many wrong codes in a row, or 0:
 * every fifth wrong code locks it, for 15 minutes the first time and twice
 * as long each time after, up to a day. Someone who has the password gets a
 * handful of guesses a day, not thousands.
 */
export function lockDurationMs(failures: number): number {
  if (failures <= 0 || failures % LOCK_EVERY_FAILURES !== 0) return 0;
  const doublings = failures / LOCK_EVERY_FAILURES - 1;
  return Math.min(MAX_LOCK_MS, FIRST_LOCK_MS * 2 ** Math.min(doublings, 10));
}
