import { describe, it, expect } from "vitest";
import {
  base32Decode,
  base32Encode,
  checkTotp,
  hashRecoveryCode,
  hotp,
  lockDurationMs,
  looksLikeTotp,
  newRecoveryCodes,
  newTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  totpCode,
  totpKeyForTyping,
  totpStep,
} from "../two-step/totp";

describe("RFC 6238 Appendix B test vectors", () => {
  // The RFC's seeds: the ASCII string repeated to the hash's key length.
  const seed = {
    sha1: Buffer.from("12345678901234567890"),
    sha256: Buffer.from("12345678901234567890123456789012"),
    sha512: Buffer.from("1234567890123456789012345678901234567890123456789012345678901234"),
  };
  const vectors: [number, string, string, string][] = [
    // time (s),     SHA-1,      SHA-256,    SHA-512
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1111111111, "14050471", "67062674", "99943326"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ];

  it.each(vectors)("at T=%i", (t, sha1, sha256, sha512) => {
    const step = totpStep(new Date(t * 1000));
    expect(hotp(seed.sha1, step, 8, "sha1")).toBe(sha1);
    expect(hotp(seed.sha256, step, 8, "sha256")).toBe(sha256);
    expect(hotp(seed.sha512, step, 8, "sha512")).toBe(sha512);
  });

  it("gives the low six digits by default, as apps show", () => {
    expect(totpCode(seed.sha1, new Date(59_000))).toBe("287082");
    expect(totpCode(seed.sha1, new Date(1111111109_000))).toBe("081804");
  });
});

describe("RFC 4226 Appendix D HOTP values", () => {
  const secret = Buffer.from("12345678901234567890");
  const want = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  it.each(want.map((w, i) => [i, w]))("counter %i", (counter, code) => {
    expect(hotp(secret, counter as number)).toBe(code);
  });
});

describe("checkTotp: time steps and replay", () => {
  const secret = Buffer.from("12345678901234567890");
  const at = (s: number) => new Date(s * 1000);

  it("accepts the current step and one either side, not two", () => {
    const now = at(1111111111); // step 37037037
    const step = totpStep(now);
    for (const d of [-1, 0, 1]) {
      expect(checkTotp(secret, hotp(secret, step + d), now, 0)).toBe(step + d);
    }
    for (const d of [-2, 2]) {
      expect(checkTotp(secret, hotp(secret, step + d), now, 0)).toBeNull();
    }
  });

  it("changes step exactly at a multiple of 30 seconds", () => {
    expect(totpStep(new Date(29_999))).toBe(0);
    expect(totpStep(new Date(30_000))).toBe(1);
    expect(totpStep(at(59))).toBe(1);
    expect(totpStep(at(60))).toBe(2);
  });

  it("never accepts a code from a step already used, or earlier", () => {
    const now = at(1234567890);
    const step = totpStep(now);
    const code = hotp(secret, step);
    expect(checkTotp(secret, code, now, step - 1)).toBe(step);
    expect(checkTotp(secret, code, now, step)).toBeNull();
    expect(checkTotp(secret, hotp(secret, step - 1), now, step)).toBeNull();
    // The next step's code is still good.
    expect(checkTotp(secret, hotp(secret, step + 1), now, step)).toBe(step + 1);
  });

  it("ignores spaces and refuses anything that isn't six digits", () => {
    const now = at(1234567890);
    const code = totpCode(secret, now);
    expect(checkTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now, 0)).toBe(totpStep(now));
    for (const bad of ["", "12345", "1234567", "abcdef", "12345a"]) {
      expect(checkTotp(secret, bad, now, 0)).toBeNull();
    }
  });

  it("tells an app code from a recovery code", () => {
    expect(looksLikeTotp("123 456")).toBe(true);
    expect(looksLikeTotp("k7m2-q9wf-d3xp-a8bn")).toBe(false);
  });
});

describe("base32 (RFC 4648 section 10, without padding)", () => {
  it.each([
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ])("%j ⇄ %s", (plain, encoded) => {
    expect(base32Encode(Buffer.from(plain))).toBe(encoded);
    expect(base32Decode(encoded).toString()).toBe(plain);
  });

  it("round-trips a 160-bit secret and reads the grouped key back", () => {
    const secret = newTotpSecret();
    expect(secret).toHaveLength(20);
    const key = totpKeyForTyping(secret);
    expect(key).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
    expect(base32Decode(key).equals(secret)).toBe(true);
  });
});

describe("otpauthUri", () => {
  it("is what authenticator apps read", () => {
    const uri = otpauthUri("Gideon Tasks", "kitty@example.com", Buffer.from("12345678901234567890"));
    expect(uri).toBe(
      "otpauth://totp/Gideon%20Tasks:kitty%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Gideon+Tasks&algorithm=SHA1&digits=6&period=30",
    );
  });
});

describe("recovery codes", () => {
  it("are 10 distinct codes of four groups of four, without look-alike characters", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-hj-km-np-z2-9]{4}(-[a-hj-km-np-z2-9]{4}){3}$/);
  });

  it("hash the same however they are typed, and differently from each other", () => {
    const [a, b] = newRecoveryCodes(2);
    expect(hashRecoveryCode(a.toUpperCase().replace(/-/g, " "))).toBe(hashRecoveryCode(a));
    expect(hashRecoveryCode(a)).not.toBe(hashRecoveryCode(b));
    expect(hashRecoveryCode(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode(a)).not.toContain(normalizeRecoveryCode(a));
  });
});

describe("lockDurationMs: escalating lockout", () => {
  it("locks on every fifth wrong code, 15 minutes doubling up to a day", () => {
    const min = 60_000;
    expect([1, 2, 3, 4].map(lockDurationMs)).toEqual([0, 0, 0, 0]);
    expect(lockDurationMs(5)).toBe(15 * min);
    expect(lockDurationMs(6)).toBe(0);
    expect(lockDurationMs(10)).toBe(30 * min);
    expect(lockDurationMs(15)).toBe(60 * min);
    expect(lockDurationMs(25)).toBe(240 * min);
    expect(lockDurationMs(35)).toBe(960 * min);
    expect(lockDurationMs(40)).toBe(24 * 60 * min);
    expect(lockDurationMs(500)).toBe(24 * 60 * min);
  });
});
