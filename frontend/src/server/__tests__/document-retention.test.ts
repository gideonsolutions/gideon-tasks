import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The retention job deletes task files 30 days after the task closes, proof
 * files 90 days after the decision, and unfinished uploads after a day, and
 * audits each deletion. The cron route only runs it with CRON_SECRET.
 */

const state = vi.hoisted(() => ({
  closed: [] as { id: string; task_id: string; pathname: string }[],
  stale: [] as { id: string; task_id: string; pathname: string }[],
  reviewed: [] as { id: string; pathname: string; status: string }[],
  unfinished: [] as { id: string; pathname: string }[],
  failPath: null as string | null,
  enabled: true,
}));

const db = vi.hoisted(() => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes("JOIN tasks t")) return state.closed;
    if (sql.includes("FROM task_documents") && sql.includes("status = 'pending'")) return state.stale;
    if (sql.includes("FROM preparer_proofs") && sql.includes("'approved', 'rejected'")) return state.reviewed;
    if (sql.includes("FROM preparer_proofs") && sql.includes("status = 'uploading'")) return state.unfinished;
    throw new Error(`Unexpected query: ${sql}`);
  }),
  queryOne: vi.fn(async (_sql: string, params: unknown[] = []) => ({ id: params[0] })),
  execute: vi.fn(async () => {}),
}));
const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => {}) }));
const storage = vi.hoisted(() => ({
  deleteBlob: vi.fn(async (pathname: string) => {
    if (pathname === state.failPath) throw new Error("Blob service unavailable");
  }),
}));

vi.mock("../db", () => db);
vi.mock("../audit", () => audit);
vi.mock("../documents/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../documents/storage")>()),
  ...storage,
  documentsEnabled: () => state.enabled,
}));

import { runDocumentRetention } from "../documents/retention";
import { GET as cron } from "@/app/api/cron/document-retention/route";

const NOW = new Date("2026-12-21T09:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  state.closed = [{ id: "d1", task_id: "t1", pathname: "tasks/t1/d1.pdf" }];
  state.stale = [{ id: "d2", task_id: "t2", pathname: "tasks/t2/d2.png" }];
  state.reviewed = [{ id: "p1", pathname: "proofs/u1/p1.pdf", status: "approved" }];
  state.unfinished = [{ id: "p2", pathname: "proofs/u2/p2.heic" }];
  state.failPath = null;
  state.enabled = true;
});

describe("runDocumentRetention", () => {
  it("looks for files past each period", async () => {
    await runDocumentRetention(NOW);
    const calls = db.query.mock.calls as unknown as [string, unknown[]][];
    expect(calls[0][1]).toEqual([["completed", "cancelled", "resolved"], new Date("2026-11-21T09:30:00Z")]);
    expect(calls[0][0]).toContain("t.updated_at < $2");
    expect(calls[1][1]).toEqual([new Date("2026-12-20T09:30:00Z")]);
    expect(calls[2][1]).toEqual([new Date("2026-09-22T09:30:00Z")]);
    expect(calls[2][0]).toContain("file_deleted_at IS NULL AND reviewed_at < $1");
    expect(calls[3][1]).toEqual([new Date("2026-12-20T09:30:00Z")]);
  });

  it("deletes each file, marks it deleted, and audits it with no actor", async () => {
    const result = await runDocumentRetention(NOW);
    expect(result).toEqual({
      task_documents_deleted: 1,
      task_uploads_abandoned: 1,
      proofs_deleted: 1,
      proof_uploads_abandoned: 1,
      failed: 0,
    });
    expect(storage.deleteBlob.mock.calls.map((c) => c[0])).toEqual([
      "tasks/t1/d1.pdf",
      "tasks/t2/d2.png",
      "proofs/u1/p1.pdf",
      "proofs/u2/p2.heic",
    ]);
    expect(audit.logAudit).toHaveBeenCalledWith(null, "task_document.deleted", "task_document", "d1", null, {
      task_id: "t1",
      reason: "retention",
      retention_days: 30,
    });
    expect(audit.logAudit).toHaveBeenCalledWith(null, "preparer_proof.file_deleted", "preparer_proof", "p1", null, {
      reason: "retention",
      retention_days: 90,
      status: "approved",
    });
    const updates = (db.queryOne.mock.calls as unknown as [string][]).map(([sql]) => sql);
    expect(updates[0]).toContain("deleted_reason = 'retention', display_name = NULL");
    expect(updates[2]).toContain("SET file_deleted_at = now(), display_name = NULL");
  });

  it("leaves a file it couldn't delete for the next run", async () => {
    state.failPath = "tasks/t1/d1.pdf";
    const result = await runDocumentRetention(NOW);
    expect(result.failed).toBe(1);
    expect(result.task_documents_deleted).toBe(0);
    expect(audit.logAudit).not.toHaveBeenCalledWith(null, "task_document.deleted", "task_document", "d1", null, expect.anything());
    // The others still go.
    expect(result.proofs_deleted).toBe(1);
  });
});

describe("GET /api/cron/document-retention", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "a-long-random-cron-secret";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });
  const call = (auth?: string) =>
    cron(
      new Request("https://www.gideontasks.com/api/cron/document-retention", {
        headers: auth ? { authorization: auth } : {},
      }),
    );

  it("refuses a call without the secret, or with the wrong one", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(storage.deleteBlob).not.toHaveBeenCalled();
  });

  it("refuses every call when CRON_SECRET isn't set", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer undefined")).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("runs with Vercel Cron's header", async () => {
    const res = await call("Bearer a-long-random-cron-secret");
    expect(res.status).toBe(200);
    expect((await res.json()).task_documents_deleted).toBe(1);
  });

  it("does nothing when storage isn't set up", async () => {
    state.enabled = false;
    const res = await call("Bearer a-long-random-cron-secret");
    expect(await res.json()).toEqual({ skipped: "Document storage is not set up" });
    expect(db.query).not.toHaveBeenCalled();
  });
});
