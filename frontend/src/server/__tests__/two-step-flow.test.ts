import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * Two-step sign-in end to end, against a small in-memory stand-in for the
 * users, refresh_tokens and mfa_recovery_codes tables: setting it up, the
 * login second step, refresh never bypassing it, recovery codes used once,
 * the lockout, turning it off, the admin reset, and that no secret or code
 * reaches the audit log. JWTs and AES-GCM are real; bcrypt is replaced by a
 * plain stand-in for speed.
 */

const USER = "0190d0c0-0000-7000-8000-00000000f001";
const ADMIN = "0190d0c0-0000-7000-8000-00000000f002";
const KEY_HEX = "3c".repeat(32);

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
  users: new Map<string, Row>(),
  refresh: [] as Row[],
  codes: [] as Row[],
}));

const db = vi.hoisted(() => {
  const user = (id: unknown) => store.users.get(id as string) ?? null;
  const queryOne = vi.fn(async (sql: string, p: unknown[] = []): Promise<Row | null> => {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.startsWith("SELECT * FROM users WHERE email = $1")) {
      return [...store.users.values()].find((u) => u.email === p[0]) ?? null;
    }
    if (s.startsWith("SELECT COUNT(*)::int AS n FROM mfa_recovery_codes")) {
      return { n: store.codes.filter((c) => c.user_id === p[0] && !c.used_at).length };
    }
    if (s.startsWith("SELECT id, user_id, mfa_verified FROM refresh_tokens")) {
      return store.refresh.find((r) => r.token_hash === p[0]) ?? null;
    }
    if (s.startsWith("SELECT") && s.includes("FROM users WHERE id = $1")) {
      const u = user(p[0]);
      return u ? { ...u } : null; // a copy, as a database returns
    }
    if (s.startsWith("UPDATE users SET totp_last_step = $1")) {
      const u = user(p[1]);
      if (!u || Number(u.totp_last_step) >= (p[0] as number)) return null;
      Object.assign(u, { totp_last_step: p[0], totp_failures: 0, totp_locked_until: null });
      return { id: u.id };
    }
    if (s.startsWith("UPDATE mfa_recovery_codes SET used_at = now()")) {
      const c = store.codes.find((c) => c.user_id === p[0] && c.code_hash === p[1] && !c.used_at);
      if (!c) return null;
      c.used_at = new Date().toISOString();
      return { id: c.id };
    }
    throw new Error(`Unexpected queryOne: ${s}`);
  });
  const execute = vi.fn(async (sql: string, p: unknown[] = []) => {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.startsWith("INSERT INTO refresh_tokens")) {
      store.refresh.push({ id: p[0], user_id: p[1], token_hash: p[2], expires_at: p[3], mfa_verified: p[4] });
    } else if (s.startsWith("DELETE FROM refresh_tokens WHERE id = $1")) {
      store.refresh = store.refresh.filter((r) => r.id !== p[0]);
    } else if (s.startsWith("DELETE FROM refresh_tokens WHERE user_id = $1")) {
      store.refresh = store.refresh.filter((r) => r.user_id !== p[0]);
    } else if (s.startsWith("UPDATE users SET totp_secret_enc = $1")) {
      Object.assign(user(p[1])!, { totp_secret_enc: p[0], totp_enabled_at: null, totp_last_step: 0, totp_failures: 0, totp_locked_until: null });
    } else if (s.startsWith("UPDATE users SET totp_enabled_at = now()")) {
      Object.assign(user(p[1])!, { totp_enabled_at: new Date().toISOString(), totp_last_step: p[0], totp_failures: 0, totp_locked_until: null });
    } else if (s.startsWith("UPDATE users SET totp_secret_enc = NULL")) {
      Object.assign(user(p[0])!, { totp_secret_enc: null, totp_enabled_at: null, totp_last_step: 0, totp_failures: 0, totp_locked_until: null });
    } else if (s.startsWith("UPDATE users SET totp_failures = 0, totp_locked_until = NULL WHERE id = $1")) {
      Object.assign(user(p[0])!, { totp_failures: 0, totp_locked_until: null });
    } else if (s.startsWith("UPDATE users SET totp_failures = $1")) {
      const u = user(p[2])!;
      u.totp_failures = p[0];
      if (p[1]) u.totp_locked_until = (p[1] as Date).toISOString();
    } else if (s.startsWith("DELETE FROM mfa_recovery_codes WHERE user_id = $1")) {
      store.codes = store.codes.filter((c) => c.user_id !== p[0]);
    } else if (s.startsWith("INSERT INTO mfa_recovery_codes")) {
      store.codes.push({ id: p[0], user_id: p[1], code_hash: p[2], used_at: null });
    } else {
      throw new Error(`Unexpected execute: ${s}`);
    }
  });
  return { queryOne, execute, query: vi.fn(async () => []) };
});
const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => {}) }));

vi.mock("../db", () => db);
vi.mock("../audit", () => audit);
vi.mock("../auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth")>()),
  // bcrypt at cost 12 is slow; the stand-in keeps the same contract.
  verifyPassword: vi.fn(async (pw: string, hash: string) => hash === `pw:${pw}`),
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as loginTwoStep } from "@/app/api/auth/login/two-step/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as setupRoute } from "@/app/api/users/me/two-step/setup/route";
import { POST as enableRoute } from "@/app/api/users/me/two-step/enable/route";
import { POST as disableRoute } from "@/app/api/users/me/two-step/disable/route";
import { POST as recoveryRoute } from "@/app/api/users/me/two-step/recovery-codes/route";
import { POST as adminResetRoute } from "@/app/api/admin/users/[id]/two-step/route";
import { createAccessToken, decodeAccessToken, requireAuth } from "../auth";
import { issuePendingLogin } from "../two-step/pending-login";
import { openSecret } from "../two-step/secret-box";
import { base32Decode, hotp, totpCode, totpStep } from "../two-step/totp";
import { WRONG_CODE, requireTwoStep } from "../two-step/service";
import { AppError } from "../errors";

const T0 = new Date("2026-11-22T12:00:00Z");
const savedEnv = { ...process.env };

function post(path: string, body: unknown, token?: string) {
  return new Request(`https://www.gideontasks.com/api${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}
const userParams = (id: string) => ({ params: Promise.resolve({ id }) });

function seedUser(id: string, over: Row = {}) {
  store.users.set(id, {
    id,
    email: `${id.slice(-4)}@example.com`,
    password_hash: "pw:correct horse",
    status: "active",
    is_admin: false,
    trust_level: 1,
    legal_first_name: "Kitty",
    legal_last_name: "Cats",
    totp_secret_enc: null,
    totp_enabled_at: null,
    totp_last_step: 0,
    totp_failures: 0,
    totp_locked_until: null,
    ...over,
  });
}

/** The user's secret, read back from the sealed column. */
const secretOf = (id: string) => openSecret(id, store.users.get(id)!.totp_secret_enc as string);
const codeNow = (id: string) => totpCode(secretOf(id), new Date());

async function turnOn(id: string): Promise<{ codes: string[]; access: string; refresh: string }> {
  const token = await createAccessToken(id, !!store.users.get(id)!.is_admin, 1, false);
  const setup = await (await setupRoute(post("/users/me/two-step/setup", {}, token))).json();
  expect(base32Decode(setup.key).equals(secretOf(id))).toBe(true);
  const res = await enableRoute(post("/users/me/two-step/enable", { password: "correct horse", code: codeNow(id) }, token));
  expect(res.status).toBe(200);
  const body = await res.json();
  // The next code needs a later step.
  vi.setSystemTime(new Date(Date.now() + 30_000));
  return { codes: body.recovery_codes, access: body.access_token, refresh: body.refresh_token };
}

async function passwordStep(id: string): Promise<string> {
  const res = await login(post("/auth/login", { email: store.users.get(id)!.email, password: "correct horse" }));
  const body = await res.json();
  expect(body.two_step_required).toBe(true);
  return body.pending_token;
}

const auditJson = () => JSON.stringify(audit.logAudit.mock.calls);
const actions = () => (audit.logAudit.mock.calls as unknown as unknown[][]).map((c) => c[1]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  process.env.JWT_SECRET = "test-jwt-secret-with-enough-length-0123456789";
  process.env.MFA_ENCRYPTION_KEY = KEY_HEX;
  store.users.clear();
  store.refresh = [];
  store.codes = [];
  seedUser(USER);
  seedUser(ADMIN, { is_admin: true });
});
afterEach(() => {
  vi.useRealTimers();
  process.env = { ...savedEnv };
});

describe("setting it up", () => {
  it("encrypts the secret, confirms a code, stores only hashes of 10 recovery codes, and starts a verified session", async () => {
    const { codes, access } = await turnOn(USER);
    const u = store.users.get(USER)!;
    expect(u.totp_enabled_at).not.toBeNull();
    expect(String(u.totp_secret_enc).startsWith("v1:")).toBe(true);
    expect(codes).toHaveLength(10);
    expect(store.codes).toHaveLength(10);
    for (const c of codes) {
      expect(JSON.stringify(store.codes)).not.toContain(c);
    }
    expect((await decodeAccessToken(access)).mfa).toBe(true);
    expect(store.refresh.every((r) => r.mfa_verified === true)).toBe(true);
    expect(actions()).toContain("user.two_step.enabled");
  });

  it("isn't turned on by a wrong code or password", async () => {
    const token = await createAccessToken(USER, false, 1, false);
    await setupRoute(post("/users/me/two-step/setup", {}, token));
    expect((await enableRoute(post("/users/me/two-step/enable", { password: "correct horse", code: "000000" }, token))).status).toBe(400);
    expect((await enableRoute(post("/users/me/two-step/enable", { password: "wrong", code: codeNow(USER) }, token))).status).toBe(400);
    expect(store.users.get(USER)!.totp_enabled_at).toBeNull();
  });

  it("isn't available without MFA_ENCRYPTION_KEY", async () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    const token = await createAccessToken(USER, false, 1, false);
    expect((await setupRoute(post("/users/me/two-step/setup", {}, token))).status).toBe(400);
  });
});

describe("signing in", () => {
  it("issues tokens at once for an account without two-step sign-in", async () => {
    const res = await login(post("/auth/login", { email: store.users.get(USER)!.email, password: "correct horse" }));
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    expect((await decodeAccessToken(body.access_token)).mfa).toBe(false);
  });

  it("with it on, issues no access or refresh token for the password alone", async () => {
    await turnOn(USER);
    store.refresh = [];
    const res = await login(post("/auth/login", { email: store.users.get(USER)!.email, password: "correct horse" }));
    const body = await res.json();
    expect(body).toEqual({ two_step_required: true, pending_token: expect.any(String), expires_in: 300 });
    expect(body.access_token).toBeUndefined();
    expect(store.refresh).toHaveLength(0);
  });

  it("issues a verified session after a right code", async () => {
    await turnOn(USER);
    const pending = await passwordStep(USER);
    const res = await loginTwoStep(post("/auth/login/two-step", { pending_token: pending, code: codeNow(USER) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect((await decodeAccessToken(body.access_token)).mfa).toBe(true);
    expect(body.user.totp_secret_enc).toBeUndefined();
    expect(audit.logAudit).toHaveBeenCalledWith(USER, "user.login", "user", USER, null, { second_factor: "totp" });
  });

  it("won't take the same code twice", async () => {
    await turnOn(USER);
    const code = codeNow(USER);
    expect((await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code }))).status).toBe(200);
    const again = await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code }));
    expect(again.status).toBe(400);
    expect((await again.json()).error).toBe(WRONG_CODE);
  });

  it("accepts a code from one step either side, not two", async () => {
    await turnOn(USER);
    const step = totpStep(new Date());
    const secret = secretOf(USER);
    expect((await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: hotp(secret, step + 2) }))).status).toBe(400);
    expect((await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: hotp(secret, step + 1) }))).status).toBe(200);
  });

  it("refuses an expired pending token, and one from before a password change", async () => {
    await turnOn(USER);
    const pending = await passwordStep(USER);
    vi.setSystemTime(new Date(Date.now() + 5 * 60_000 + 1000));
    expect((await loginTwoStep(post("/auth/login/two-step", { pending_token: pending, code: codeNow(USER) }))).status).toBe(401);

    const fresh = await passwordStep(USER);
    store.users.get(USER)!.password_hash = "pw:new password";
    expect((await loginTwoStep(post("/auth/login/two-step", { pending_token: fresh, code: codeNow(USER) }))).status).toBe(401);
  });

  it("never lets a pending token pass as an access token", async () => {
    const pending = await issuePendingLogin(USER, "pw:correct horse");
    const req = new Request("https://www.gideontasks.com/api/users/me", { headers: { authorization: `Bearer ${pending}` } });
    await expect(requireAuth(req)).rejects.toBeInstanceOf(AppError);
  });
});

describe("refresh doesn't bypass the second step", () => {
  it("refuses a refresh token from before two-step sign-in was turned on", async () => {
    const res = await login(post("/auth/login", { email: store.users.get(USER)!.email, password: "correct horse" }));
    const old = (await res.json()).refresh_token;
    // Turned on from another session; that session's tokens are revoked by
    // enable, so put the old one back to try the bypass.
    const saved = [...store.refresh];
    await turnOn(USER);
    store.refresh.push(...saved);
    const r = await refresh(post("/auth/refresh", { refresh_token: old }));
    expect(r.status).toBe(401);
    expect((await r.json()).error).toMatch(/two-step code/);
  });

  it("keeps a verified session verified, and never makes one verified", async () => {
    const { refresh: verified } = await turnOn(USER);
    const r = await (await refresh(post("/auth/refresh", { refresh_token: verified }))).json();
    expect((await decodeAccessToken(r.access_token)).mfa).toBe(true);

    const plain = await (await login(post("/auth/login", { email: store.users.get(ADMIN)!.email, password: "correct horse" }))).json();
    const r2 = await (await refresh(post("/auth/refresh", { refresh_token: plain.refresh_token }))).json();
    expect((await decodeAccessToken(r2.access_token)).mfa).toBe(false);
  });

  it("signs out other sessions when it is turned on", async () => {
    await login(post("/auth/login", { email: store.users.get(USER)!.email, password: "correct horse" }));
    await turnOn(USER);
    expect(store.refresh.filter((r) => r.user_id === USER).every((r) => r.mfa_verified)).toBe(true);
    expect(store.refresh.filter((r) => r.user_id === USER)).toHaveLength(1);
  });
});

describe("recovery codes", () => {
  it("each signs in once", async () => {
    const { codes } = await turnOn(USER);
    const first = await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: codes[0].toUpperCase() }));
    expect(first.status).toBe(200);
    expect((await first.json()).recovery_codes_left).toBe(9);
    const again = await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: codes[0] }));
    expect(again.status).toBe(400);
    expect(actions()).toContain("user.two_step.recovery_code_used");
  });

  it("are all replaced with the password and a code", async () => {
    const { codes, access } = await turnOn(USER);
    const res = await recoveryRoute(post("/users/me/two-step/recovery-codes", { password: "correct horse", code: codeNow(USER) }, access));
    const fresh = (await res.json()).recovery_codes;
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toContain(codes[1]);
    vi.setSystemTime(new Date(Date.now() + 30_000));
    expect((await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: codes[1] }))).status).toBe(400);
  });
});

describe("lockout", () => {
  it("locks after five wrong codes, refuses even a right code while locked, and audits it", async () => {
    await turnOn(USER);
    for (let i = 1; i <= 4; i++) {
      const r = await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: "000000" }));
      expect(r.status).toBe(400);
    }
    const fifth = await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: "000000" }));
    expect(fifth.status).toBe(429);
    expect(store.users.get(USER)!.totp_locked_until).toBe("2026-11-22T12:15:30.000Z");
    expect(audit.logAudit).toHaveBeenCalledWith(null, "user.two_step.locked", "user", USER, null, {
      failures: 5,
      locked_until: "2026-11-22T12:15:30.000Z",
      minutes: 15,
    });
    const right = await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: codeNow(USER) }));
    expect(right.status).toBe(429);

    // After the lock, a right code works and clears the count.
    vi.setSystemTime(new Date("2026-11-22T12:16:00Z"));
    const later = await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: codeNow(USER) }));
    expect(later.status).toBe(200);
    expect(store.users.get(USER)!.totp_failures).toBe(0);
  });

  it("locks for longer the next time", async () => {
    await turnOn(USER);
    store.users.get(USER)!.totp_failures = 9;
    const r = await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: "000000" }));
    expect(r.status).toBe(429);
    expect(store.users.get(USER)!.totp_locked_until).toBe("2026-11-22T12:30:30.000Z");
  });
});

describe("turning it off", () => {
  it("needs the password and a code, and ends every session", async () => {
    const { access } = await turnOn(USER);
    expect((await disableRoute(post("/users/me/two-step/disable", { password: "correct horse", code: "000000" }, access))).status).toBe(400);
    expect((await disableRoute(post("/users/me/two-step/disable", { password: "nope", code: codeNow(USER) }, access))).status).toBe(400);
    expect(store.users.get(USER)!.totp_enabled_at).not.toBeNull();
    const res = await disableRoute(post("/users/me/two-step/disable", { password: "correct horse", code: codeNow(USER) }, access));
    expect(res.status).toBe(200);
    expect((await decodeAccessToken((await res.json()).access_token)).mfa).toBe(false);
    expect(store.users.get(USER)!.totp_enabled_at).toBeNull();
    expect(store.users.get(USER)!.totp_secret_enc).toBeNull();
    expect(store.codes).toHaveLength(0);
  });
});

describe("admin reset", () => {
  it("needs an admin signed in with two-step sign-in, and a note", async () => {
    await turnOn(USER);
    const plainAdmin = await createAccessToken(ADMIN, true, 3, false);
    const r = await adminResetRoute(post(`/admin/users/${USER}/two-step`, { note: "Called them" }, plainAdmin), userParams(USER));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("two_step_required");

    const { access: adminSession } = await turnOn(ADMIN);
    expect((await adminResetRoute(post(`/admin/users/${USER}/two-step`, { note: " " }, adminSession), userParams(USER))).status).toBe(400);
    const nonAdmin = await createAccessToken(USER, false, 1, true);
    expect((await adminResetRoute(post(`/admin/users/${ADMIN}/two-step`, { note: "x" }, nonAdmin), userParams(ADMIN))).status).toBe(403);
  });

  it("turns it off, unlocks, signs the user out everywhere, and audits the note", async () => {
    await turnOn(USER);
    store.users.get(USER)!.totp_locked_until = "2026-11-23T00:00:00Z";
    const { access: adminSession } = await turnOn(ADMIN);
    const res = await adminResetRoute(
      post(`/admin/users/${USER}/two-step`, { note: "Confirmed by video call with photo ID" }, adminSession),
      userParams(USER),
    );
    expect(res.status).toBe(200);
    const u = store.users.get(USER)!;
    expect(u.totp_enabled_at).toBeNull();
    expect(u.totp_locked_until).toBeNull();
    expect(store.refresh.filter((r) => r.user_id === USER)).toHaveLength(0);
    expect(audit.logAudit).toHaveBeenCalledWith(ADMIN, "admin.user.two_step_reset", "user", USER, { enabled: true }, {
      enabled: false,
      note: "Confirmed by video call with photo ID",
    });
  });

  it("can't be used on the admin's own account", async () => {
    const { access } = await turnOn(ADMIN);
    expect((await adminResetRoute(post(`/admin/users/${ADMIN}/two-step`, { note: "me" }, access), userParams(ADMIN))).status).toBe(400);
  });
});

describe("requireTwoStep", () => {
  it("needs both the account's two-step sign-in and a session that passed it", async () => {
    await expect(requireTwoStep({ userId: USER, isAdmin: false, trustLevel: 1, mfa: true })).rejects.toMatchObject({
      kind: "two_step_required",
    });
    await turnOn(USER);
    await expect(requireTwoStep({ userId: USER, isAdmin: false, trustLevel: 1, mfa: false })).rejects.toMatchObject({
      kind: "two_step_required",
    });
    await expect(requireTwoStep({ userId: USER, isAdmin: false, trustLevel: 1, mfa: true })).resolves.toBeUndefined();
  });
});

describe("nothing secret is written down", () => {
  it("keeps secrets and codes out of the audit log", async () => {
    const { codes } = await turnOn(USER);
    const secret = secretOf(USER);
    await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: "135792" }));
    await loginTwoStep(post("/auth/login/two-step", { pending_token: await passwordStep(USER), code: codes[2] }));
    const logged = auditJson();
    for (const c of codes) expect(logged).not.toContain(c);
    expect(logged).not.toContain("135792");
    expect(logged).not.toContain(secret.toString("hex"));
    expect(logged).not.toContain(createHash("sha256").update(secret).digest("hex"));
  });
});
