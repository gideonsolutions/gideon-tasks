import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { mfaKey, openSecret, sealSecret } from "../two-step/secret-box";
import { base32Encode } from "../two-step/totp";

const KEY = Buffer.from("0f".repeat(32), "hex");
const OTHER_KEY = Buffer.from("a1".repeat(32), "hex");
const USER = "0190d0c0-0000-7000-8000-00000000e001";
const OTHER_USER = "0190d0c0-0000-7000-8000-00000000e002";

describe("sealing the authenticator secret (AES-256-GCM)", () => {
  const secret = randomBytes(20);

  it("round-trips", () => {
    expect(openSecret(USER, sealSecret(USER, secret, KEY), KEY).equals(secret)).toBe(true);
  });

  it("never stores the secret in any readable form", () => {
    const sealed = sealSecret(USER, secret, KEY);
    expect(sealed.startsWith("v1:")).toBe(true);
    for (const form of [secret.toString("hex"), secret.toString("base64"), base32Encode(secret)]) {
      expect(sealed).not.toContain(form);
    }
  });

  it("uses a new IV each time", () => {
    expect(sealSecret(USER, secret, KEY)).not.toBe(sealSecret(USER, secret, KEY));
  });

  it("can't be opened with another key, for another user, or after tampering", () => {
    const sealed = sealSecret(USER, secret, KEY);
    expect(() => openSecret(USER, sealed, OTHER_KEY)).toThrow();
    expect(() => openSecret(OTHER_USER, sealed, KEY)).toThrow();
    const raw = Buffer.from(sealed.slice(3), "base64");
    raw[14] ^= 1;
    expect(() => openSecret(USER, `v1:${raw.toString("base64")}`, KEY)).toThrow();
    expect(() => openSecret(USER, "v2:abc", KEY)).toThrow();
  });
});

describe("MFA_ENCRYPTION_KEY", () => {
  it("is 32 bytes as 64 hex characters, or absent", () => {
    expect(mfaKey({ MFA_ENCRYPTION_KEY: "0f".repeat(32) })?.equals(KEY)).toBe(true);
    expect(mfaKey({})).toBeNull();
    expect(() => mfaKey({ MFA_ENCRYPTION_KEY: "abc" })).toThrow(/64 hex/);
    expect(() => mfaKey({ MFA_ENCRYPTION_KEY: "zz".repeat(32) })).toThrow(/64 hex/);
  });
});
