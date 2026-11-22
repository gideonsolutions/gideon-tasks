import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// The authenticator secret is encrypted at rest with AES-256-GCM under
// MFA_ENCRYPTION_KEY (32 bytes, as 64 hex characters), which lives only in
// the environment, never in the database. The user's ID is the additional
// authenticated data, so a sealed secret can't be copied onto another
// account. A copy of the database alone can't produce codes.

const VERSION = "v1";

/** The key, or null if MFA_ENCRYPTION_KEY isn't set (two-step sign-in is then unavailable). */
export function mfaKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const hex = env.MFA_ENCRYPTION_KEY?.trim();
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes written as 64 hex characters");
  }
  return Buffer.from(hex, "hex");
}

/** Whether two-step sign-in can be used on this deployment. */
export function twoStepAvailable(): boolean {
  try {
    return mfaKey() !== null;
  } catch {
    return false;
  }
}

function requireKey(): Buffer {
  const key = mfaKey();
  if (!key) throw new Error("MFA_ENCRYPTION_KEY must be set");
  return key;
}

const aad = (userId: string) => Buffer.from(`totp:user:${userId}`);

/** "v1:" + base64(12-byte IV | ciphertext | 16-byte tag). */
export function sealSecret(userId: string, secret: Uint8Array, key: Buffer = requireKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(userId));
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64")}`;
}

/** Opens a sealed secret; throws if it was altered, or sealed for another user or key. */
export function openSecret(userId: string, sealed: string, key: Buffer = requireKey()): Buffer {
  const [version, b64] = sealed.split(":");
  if (version !== VERSION || !b64) throw new Error("Unknown sealed secret format");
  const raw = Buffer.from(b64, "base64");
  if (raw.length < 12 + 16 + 1) throw new Error("Sealed secret is too short");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad(userId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
