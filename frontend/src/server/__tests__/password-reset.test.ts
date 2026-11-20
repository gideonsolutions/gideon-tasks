import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * Password reset with the database, email, audit log and bcrypt mocked. The
 * SQL is exercised against Postgres separately.
 */

const USER = "0190d0c0-0000-7000-8000-0000000000d1";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(async () => {}),
}));
const email = vi.hoisted(() => ({
  assertEmailDeliverable: vi.fn(),
  sendPasswordResetEmail: vi.fn(async () => {}),
}));
const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => {}) }));
const afterTasks = vi.hoisted(() => [] as Array<() => unknown>);

vi.mock("../db", () => db);
vi.mock("../email", () => email);
vi.mock("../audit", () => audit);
vi.mock("../auth", () => ({
  newId: () => "0190d0c0-0000-7000-8000-0000000000ee",
  hashPassword: vi.fn(async (p: string) => `bcrypt(${p})`),
}));
vi.mock("../env", () => ({
  env: { jwtAccessExpirySecs: 900 },
  siteUrl: (path: string) => `https://www.gideontasks.com${path}`,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    afterTasks.push(task);
  },
}));

import {
  FORGOT_PASSWORD_MESSAGE,
  RESET_EMAIL_ISSUED_ACTION,
  RESET_REQUESTED_ACTION,
  resetPassword,
  sendPasswordResetIfAccountExists,
} from "../password-reset";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPasswordRoute } from "@/app/api/auth/reset-password/route";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const GOOD_TOKEN = "ab".repeat(32);
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

function jsonRequest(path: string, body: unknown, ip = "203.0.113.9") {
  return new Request(`https://www.gideontasks.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
});

// ─── Requesting a link ───────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  /** Fake DB: the per-IP count is 0, and `account` decides the lookup. */
  function withAccount(account: { id: string; email: string; status: string } | null) {
    db.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM audit_log")) return { count: 0 };
      if (sql.includes("FROM users WHERE lower(email)")) return account;
      if (sql.includes("FROM password_resets WHERE user_id")) return { seconds_since_last: null, last_day: 0 };
      throw new Error(`Unexpected query: ${sql}`);
    });
  }

  async function call(address: string) {
    const res = await forgotPassword(jsonRequest("/api/auth/forgot-password", { email: address }));
    return { status: res.status, body: await res.json() };
  }

  it("answers identically whether or not the address has an account", async () => {
    withAccount({ id: USER, email: "real@example.com", status: "active" });
    const known = await call("real@example.com");
    const lookupsBeforeAfter = db.queryOne.mock.calls.filter(([sql]) => sql.includes("FROM users")).length;

    withAccount(null);
    const unknown = await call("nobody@example.com");

    expect(known).toEqual(unknown);
    expect(known).toEqual({ status: 200, body: { message: FORGOT_PASSWORD_MESSAGE } });
    // The account is not even looked up before the response is sent.
    expect(lookupsBeforeAfter).toBe(0);
  });

  it("does the lookup, the token and the email after the response", async () => {
    withAccount({ id: USER, email: "real@example.com", status: "active" });
    await call("Real@Example.com");
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(1);

    await afterTasks[0]();
    expect(email.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("counts every request for the per-IP limit, with no account or address", async () => {
    withAccount(null);
    await call("nobody@example.com");
    expect(audit.logAudit).toHaveBeenCalledWith(
      null,
      RESET_REQUESTED_ACTION,
      "password_reset_request",
      expect.any(String),
      null,
      null,
      "203.0.113.9",
    );
  });

  it("rate-limits by IP for everyone alike", async () => {
    db.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM audit_log")) return { count: 20 };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const res = await forgotPassword(jsonRequest("/api/auth/forgot-password", { email: "a@example.com" }));
    expect(res.status).toBe(429);
    expect(afterTasks).toHaveLength(0);
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("rejects a malformed address without touching the database", async () => {
    const res = await forgotPassword(jsonRequest("/api/auth/forgot-password", { email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(db.queryOne).not.toHaveBeenCalled();
  });
});

describe("sendPasswordResetIfAccountExists", () => {
  function fakeDb(opts: {
    account: { id: string; email: string; status: string } | null;
    stats?: { seconds_since_last: number | null; last_day: number };
  }) {
    db.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM users WHERE lower(email)")) return opts.account;
      if (sql.includes("FROM password_resets WHERE user_id")) {
        return opts.stats ?? { seconds_since_last: null, last_day: 0 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
  }

  it("does nothing for an unknown address", async () => {
    fakeDb({ account: null });
    await expect(sendPasswordResetIfAccountExists("nobody@example.com", null)).resolves.toBe("no_account");
    expect(db.execute).not.toHaveBeenCalled();
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("does nothing for a suspended or banned account", async () => {
    fakeDb({ account: { id: USER, email: "a@example.com", status: "suspended" } });
    await expect(sendPasswordResetIfAccountExists("a@example.com", null)).resolves.toBe("inactive");
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("silently skips the email when the account's limits are reached", async () => {
    fakeDb({
      account: { id: USER, email: "a@example.com", status: "active" },
      stats: { seconds_since_last: 5, last_day: 1 },
    });
    await expect(sendPasswordResetIfAccountExists("a@example.com", null)).resolves.toBe("limited");
    expect(db.execute).not.toHaveBeenCalled();
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("stores only the hash, valid for an hour, and emails the raw token", async () => {
    fakeDb({ account: { id: USER, email: "real@example.com", status: "active" } });
    const before = Date.now();

    await expect(sendPasswordResetIfAccountExists("REAL@example.com", "203.0.113.9")).resolves.toBe("sent");

    const [sql, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("INSERT INTO password_resets");
    const [, userId, storedHash, expiresAt] = params as [string, string, string, Date];
    expect(userId).toBe(USER);
    const expiresIn = expiresAt.getTime() - before;
    expect(expiresIn).toBeGreaterThanOrEqual(3_600_000 - 1000);
    expect(expiresIn).toBeLessThanOrEqual(3_600_000 + 1000);

    // The email goes to the address on file, with a link carrying the raw token.
    const [to, link] = email.sendPasswordResetEmail.mock.calls[0] as unknown as [string, string];
    expect(to).toBe("real@example.com");
    const token = new URL(link).searchParams.get("token")!;
    expect(link.startsWith("https://www.gideontasks.com/reset-password?token=")).toBe(true);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(storedHash).toBe(sha256(token));
    expect(storedHash).not.toBe(token);

    expect(audit.logAudit).toHaveBeenCalledWith(
      USER,
      RESET_EMAIL_ISSUED_ACTION,
      "user",
      USER,
      null,
      null,
      "203.0.113.9",
    );
  });
});

// ─── Using a link ────────────────────────────────────────

describe("resetPassword", () => {
  function fakeDb(opts: {
    row: { user_id: string; expires_at: string; used_at: string | null; email_verified: boolean } | null;
    consumed?: boolean;
    sessions?: number;
  }) {
    db.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM password_resets pr JOIN users")) return opts.row;
      if (sql.includes("WITH consumed AS")) return opts.consumed === false ? null : { id: USER };
      throw new Error(`Unexpected query: ${sql}`);
    });
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("DELETE FROM refresh_tokens")) {
        return Array.from({ length: opts.sessions ?? 0 }, (_, i) => ({ id: `rt${i}` }));
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
  }

  it("rejects a malformed token without touching the database", async () => {
    await expect(resetPassword("not-a-token", "new password")).rejects.toMatchObject({
      kind: "bad_request",
      message: expect.stringContaining("not valid"),
    });
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("rejects an unknown token", async () => {
    fakeDb({ row: null });
    await expect(resetPassword(GOOD_TOKEN, "new password")).rejects.toMatchObject({
      message: expect.stringContaining("not valid"),
    });
  });

  it("rejects an expired token", async () => {
    fakeDb({
      row: { user_id: USER, expires_at: new Date(Date.now() - 1000).toISOString(), used_at: null, email_verified: true },
    });
    await expect(resetPassword(GOOD_TOKEN, "new password")).rejects.toMatchObject({
      message: expect.stringContaining("expired"),
    });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("rejects a token that was already used", async () => {
    fakeDb({
      row: { user_id: USER, expires_at: inAnHour(), used_at: new Date().toISOString(), email_verified: true },
    });
    await expect(resetPassword(GOOD_TOKEN, "new password")).rejects.toMatchObject({
      message: expect.stringContaining("already been used"),
    });
  });

  it("loses cleanly to a concurrent use of the same link", async () => {
    fakeDb({
      row: { user_id: USER, expires_at: inAnHour(), used_at: null, email_verified: true },
      consumed: false,
    });
    await expect(resetPassword(GOOD_TOKEN, "new password")).rejects.toMatchObject({
      message: expect.stringContaining("already been used"),
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("sets the password, verifies the email, retires other links and revokes sessions", async () => {
    fakeDb({
      row: { user_id: USER, expires_at: inAnHour(), used_at: null, email_verified: false },
      sessions: 3,
    });

    await expect(resetPassword(GOOD_TOKEN, "correct horse")).resolves.toEqual({
      userId: USER,
      sessionsRevoked: 3,
    });

    const consume = db.queryOne.mock.calls.find(([sql]) => sql.includes("WITH consumed AS"))!;
    expect(consume[0]).toContain("used_at IS NULL AND expires_at > now()");
    expect(consume[0]).toContain("email_verified = true");
    expect(consume[1]).toEqual([sha256(GOOD_TOKEN), "bcrypt(correct horse)"]);

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL"),
      [USER],
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM refresh_tokens WHERE user_id = $1"),
      [USER],
    );
    expect(audit.logAudit).toHaveBeenCalledWith(
      USER,
      "user.password_reset",
      "user",
      USER,
      { email_verified: false },
      { email_verified: true, sessions_revoked: 3 },
    );
  });
});

describe("POST /api/auth/reset-password", () => {
  it("applies the registration password rules", async () => {
    const res = await resetPasswordRoute(
      jsonRequest("/api/auth/reset-password", { token: GOOD_TOKEN, password: "short" }),
    );
    expect(res.status).toBe(400);
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("says how soon other sessions end", async () => {
    db.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM password_resets pr JOIN users")) {
        return { user_id: USER, expires_at: inAnHour(), used_at: null, email_verified: true };
      }
      return { id: USER };
    });
    db.query.mockResolvedValue([]);
    const res = await resetPasswordRoute(
      jsonRequest("/api/auth/reset-password", { token: GOOD_TOKEN, password: "long enough" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain("within 15 minutes");
  });
});
