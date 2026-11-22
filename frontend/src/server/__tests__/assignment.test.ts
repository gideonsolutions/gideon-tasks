import { describe, it, expect, vi, beforeEach } from "vitest";

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

beforeEach(() => vi.clearAllMocks());

describe("finalizeAssignment", () => {
  it("assigns a published task and writes the same audit entry as before", async () => {
    db.queryOne.mockResolvedValue({ id: args.taskId });

    await expect(finalizeAssignment(args)).resolves.toBe(true);

    const [sql, params] = db.queryOne.mock.calls[0];
    expect(sql).toContain("status = 'published'");
    expect(params).toEqual([args.doerId, args.taskId]);
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

  it("does nothing the second time (route and webhook both finishing)", async () => {
    db.queryOne.mockResolvedValue(null);

    await expect(finalizeAssignment(args)).resolves.toBe(false);

    expect(db.execute).not.toHaveBeenCalled();
    expect(audit.logAudit).not.toHaveBeenCalled();
  });
});
