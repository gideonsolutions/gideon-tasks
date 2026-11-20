import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  EMAIL_VERIFICATION_TTL_MS,
  generateVerificationToken,
  hashVerificationToken,
  isWellFormedVerificationToken,
  verificationExpiresAt,
  verificationTokenState,
} from "../verification-token";

describe("generateVerificationToken", () => {
  it("makes 32 random bytes, hex-encoded for the link", () => {
    const { token } = generateVerificationToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(token, "hex")).toHaveLength(32);
  });

  it("returns the SHA-256 of the token as the value to store", () => {
    const { token, tokenHash } = generateVerificationToken();
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(tokenHash).not.toBe(token);
  });

  it("does not repeat tokens", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateVerificationToken().token));
    expect(seen.size).toBe(200);
  });
});

describe("hashVerificationToken", () => {
  it("is SHA-256 hex (known vector)", () => {
    expect(hashVerificationToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic, so the link token can be looked up by its hash", () => {
    const { token, tokenHash } = generateVerificationToken();
    expect(hashVerificationToken(token)).toBe(tokenHash);
  });
});

describe("isWellFormedVerificationToken", () => {
  it("accepts generated tokens", () => {
    expect(isWellFormedVerificationToken(generateVerificationToken().token)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["too short", "ab".repeat(31)],
    ["too long", "ab".repeat(33)],
    ["not hex", "zz".repeat(32)],
    ["upper case", "AB".repeat(32)],
    ["with whitespace", ` ${"ab".repeat(32)}`],
  ])("rejects %s", (_label, token) => {
    expect(isWellFormedVerificationToken(token)).toBe(false);
  });
});

describe("expiry and single use", () => {
  const issued = new Date("2026-11-19T12:00:00Z");
  const expires = verificationExpiresAt(issued);

  it("expires 24 hours after issue", () => {
    expect(EMAIL_VERIFICATION_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(expires.toISOString()).toBe("2026-11-20T12:00:00.000Z");
  });

  it("is valid until just before expiry", () => {
    const row = { expires_at: expires, used_at: null };
    expect(verificationTokenState(row, issued)).toBe("valid");
    expect(verificationTokenState(row, new Date(expires.getTime() - 1))).toBe("valid");
  });

  it("is expired at and after the expiry instant", () => {
    const row = { expires_at: expires, used_at: null };
    expect(verificationTokenState(row, expires)).toBe("expired");
    expect(verificationTokenState(row, new Date(expires.getTime() + 60_000))).toBe("expired");
  });

  it("cannot be used twice, even before it expires", () => {
    const row = { expires_at: expires, used_at: new Date(issued.getTime() + 1000) };
    expect(verificationTokenState(row, issued)).toBe("used");
  });

  it("reads timestamps as the database returns them (ISO strings)", () => {
    const row = { expires_at: expires.toISOString(), used_at: null };
    expect(verificationTokenState(row, issued)).toBe("valid");
    expect(verificationTokenState(row, expires)).toBe("expired");
  });
});
