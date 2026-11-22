import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({ queryOne: vi.fn(), execute: vi.fn(async () => {}), query: vi.fn() }));
const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("../db", () => db);
vi.mock("../audit", () => audit);

import { finalizeAssignment } from "../assignment";

const args = {
  taskId: "0190d0c0-0000-7000-8000-0000000000c1",
  applicationId: "0190d0c0-0000-7000-8000-0000000000c2",
  doerId: "0190d0c0-0000-7000-8000-0000000000c3",
  actorId: "0190d0c0-0000-7000-8000-0000000000c4",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("finalizeAssignment", () => {
  it("assigns a published task and writes the same audit entry as before", async () => {
    db.queryOne.mockResolvedValue({ id: args.taskId });

    await expect(finalizeAssignment(args)).resolves.toBe(true);

    const [sql, params] = db.queryOne.mock.calls[0];
    expect(sql).toContain("status = 'published'");
    expect(params).toEqual([args.doerId, args.taskId, 2026, "tax-prep", "irs-help"]);
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(audit.logAudit).toHaveBeenCalledWith(
      args.actorId,
      "task.assigned",
      "task",
      args.taskId,
      { status: "published" },
      { status: "assigned", doer_id: args.doerId },
    );
  });

  it("only assigns a task for a child to a doer with a recorded background check", async () => {
    db.queryOne.mockResolvedValue({ id: args.taskId });

    await finalizeAssignment(args);

    const [sql] = db.queryOne.mock.calls[0];
    expect(sql).toContain("NOT for_minor OR EXISTS");
    expect(sql).toContain("background_check_cleared_at IS NOT NULL");
    expect(sql).toContain("u.id = $1");
  });

  it("only assigns a Tax Prep task to a doer with a PTIN recorded for this year (UTC)", async () => {
    db.queryOne.mockResolvedValue({ id: args.taskId });

    await finalizeAssignment(args);

    const [sql, params] = db.queryOne.mock.calls[0];
    expect(sql).toContain("c.id = tasks.category_id AND c.slug = $4");
    expect(sql).toContain("u.ptin IS NOT NULL AND u.ptin_year = $3");
    expect(sql).toMatch(/u\.id = \$1 AND u\.status = 'active'\s+AND u\.ptin IS NOT NULL/);
    expect(params[2]).toBe(2026);
    expect(params[3]).toBe("tax-prep");
  });

  it("only assigns an IRS Notices & Representation task to a doer with a recorded credential, PTIN or not", async () => {
    db.queryOne.mockResolvedValue({ id: args.taskId });

    await finalizeAssignment(args);

    const [sql, params] = db.queryOne.mock.calls[0];
    const clause = sql.slice(sql.indexOf("c.slug = $5"));
    expect(clause).toMatch(/u\.status = 'active'\s+AND u\.tax_credential IS NOT NULL\)\)/);
    expect(clause).not.toContain("ptin");
    expect(params[4]).toBe("irs-help");
  });

  it("uses the new year from January 1 UTC, so last year's PTIN no longer qualifies", async () => {
    vi.setSystemTime(new Date("2027-01-01T00:00:01Z"));
    db.queryOne.mockResolvedValue({ id: args.taskId });

    await finalizeAssignment(args);

    expect(db.queryOne.mock.calls[0][1][2]).toBe(2027);
  });

  it("does not assign when the doer doesn't qualify (the UPDATE matches no row)", async () => {
    db.queryOne.mockResolvedValue(null);

    await expect(finalizeAssignment(args)).resolves.toBe(false);

    expect(db.execute).not.toHaveBeenCalled();
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("does nothing the second time (route and webhook both finishing)", async () => {
    db.queryOne.mockResolvedValue(null);

    await expect(finalizeAssignment(args)).resolves.toBe(false);

    expect(db.execute).not.toHaveBeenCalled();
    expect(audit.logAudit).not.toHaveBeenCalled();
  });
});
