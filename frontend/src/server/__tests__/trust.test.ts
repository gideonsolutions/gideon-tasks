import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  queryOne: vi.fn(),
  execute: vi.fn<(sql: string, params?: unknown[]) => Promise<void>>(async () => {}),
  query: vi.fn(),
}));
vi.mock("../db", () => db);

import { updateUserTrustLevel } from "../trust";

const USER = "0190d0c0-0000-7000-8000-0000000000e1";
const DAY = 86_400_000;

function fakeDb(opts: {
  trustLevel?: number;
  ageDays: number;
  completed: number;
  disputesLost?: number;
  positive?: number;
  attested: boolean;
}) {
  db.queryOne.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT trust_level FROM users")) return { trust_level: opts.trustLevel ?? 0 };
    if (sql.includes("SELECT created_at, trust_level FROM users")) {
      return {
        created_at: new Date(Date.now() - opts.ageDays * DAY).toISOString(),
        trust_level: opts.trustLevel ?? 0,
      };
    }
    if (sql.includes("FROM reputation_summary")) {
      return {
        total_completed: opts.completed,
        disputes_lost: opts.disputesLost ?? 0,
        positive_review_rate: opts.positive ?? 0,
      };
    }
    if (sql.includes("FROM attestations")) return { attested: opts.attested };
    throw new Error(`Unexpected query: ${sql}`);
  });
}

function storedLevel(): number {
  const call = db.execute.mock.calls.find(([sql]) => sql.includes("UPDATE users SET trust_level"));
  return call?.[1]?.[0] as number;
}

beforeEach(() => vi.clearAllMocks());

describe("updateUserTrustLevel", () => {
  it("counts only confirmed attestations from active attestors", async () => {
    fakeDb({ ageDays: 20, completed: 3, attested: true });
    await updateUserTrustLevel(USER);
    const [sql, params] = db.queryOne.mock.calls.find(([s]) => String(s).includes("FROM attestations"))!;
    expect(sql).toContain("a.status = 'confirmed'");
    expect(sql).toContain("t.status = 'active'");
    expect(params).toEqual([USER]);
  });

  it("raises a vouched-for member to level 1 at 3 tasks and 15 days", async () => {
    fakeDb({ ageDays: 16, completed: 3, attested: true });
    await expect(updateUserTrustLevel(USER)).resolves.toBe(1);
    expect(storedLevel()).toBe(1);
  });

  it("leaves the same member at level 0 without the attestation", async () => {
    fakeDb({ ageDays: 16, completed: 3, attested: false });
    await expect(updateUserTrustLevel(USER)).resolves.toBe(0);
    expect(storedLevel()).toBe(0);
  });

  it("drops back to level 0 when a revoked attestation was the only reason", async () => {
    fakeDb({ trustLevel: 1, ageDays: 16, completed: 3, attested: false });
    await expect(updateUserTrustLevel(USER)).resolves.toBe(0);
  });

  it("keeps an admin-approved level 3", async () => {
    fakeDb({ trustLevel: 3, ageDays: 400, completed: 60, positive: 0.97, attested: false });
    await expect(updateUserTrustLevel(USER)).resolves.toBe(3);
  });
});
