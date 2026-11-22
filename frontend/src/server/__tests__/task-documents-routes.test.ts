import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The task documents API for every role: the requester, the assigned
 * tasker, another applicant, a stranger, and an admin with and without an
 * open dispute. The database, auth, audit log and Blob storage are mocked.
 */

const TASK = "0190d0c0-0000-7000-8000-0000000000b1";
const DOC = "0190d0c0-0000-7000-8000-0000000000d1";
const NEW_DOC = "0190d0c0-0000-7000-8000-0000000000df";
const REQUESTER = "0190d0c0-0000-7000-8000-00000000a001";
const DOER = "0190d0c0-0000-7000-8000-00000000a002";
const OTHER_APPLICANT = "0190d0c0-0000-7000-8000-00000000a003";
const STRANGER = "0190d0c0-0000-7000-8000-00000000a004";
const ADMIN = "0190d0c0-0000-7000-8000-00000000a005";

const state = vi.hoisted(() => ({
  enabled: true,
  actor: { userId: "", isAdmin: false },
  task: {} as Record<string, unknown>,
  doc: null as Record<string, unknown> | null,
  insertAllowed: true,
  blob: { size: 1234, contentType: "application/pdf" } as { size: number; contentType: string } | null,
  head: new TextEncoder().encode("%PDF-1.7"),
}));

const db = vi.hoisted(() => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes("FROM task_documents WHERE task_id = $1 AND status = 'uploaded'")) {
      return state.doc && state.doc.status === "uploaded" ? [state.doc] : [];
    }
    throw new Error(`Unexpected query: ${sql}`);
  }),
  queryOne: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM tasks t LEFT JOIN categories c")) return state.task;
    if (sql.includes("FROM task_documents WHERE id = $1 AND task_id = $2")) return state.doc;
    if (sql.includes("INSERT INTO task_documents")) return state.insertAllowed ? { id: params[0] } : null;
    if (sql.startsWith("UPDATE task_documents SET status = 'uploaded'")) {
      return { ...state.doc, status: "uploaded", size_bytes: params[0], uploaded_at: "2026-11-21T15:01:00Z" };
    }
    if (sql.startsWith("UPDATE task_documents SET status = 'deleted'")) return { id: params[0] };
    throw new Error(`Unexpected queryOne: ${sql}`);
  }),
  execute: vi.fn(async () => {}),
}));
const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => {}) }));
const storage = vi.hoisted(() => ({
  issueUploadToken: vi.fn(async () => ({ clientToken: "vercel_blob_client_x", validUntil: 1_800_000_000_000 })),
  blobInfo: vi.fn(async () => state.blob),
  blobFirstBytes: vi.fn(async () => state.head),
  blobStream: vi.fn(async () => ({ stream: new Blob(["%PDF-1.7"]).stream(), contentType: "application/pdf", size: 8 })),
  deleteBlob: vi.fn(async () => {}),
}));

vi.mock("../db", () => db);
vi.mock("../audit", () => audit);
vi.mock("../auth", () => ({
  requireAuth: vi.fn(async () => ({ ...state.actor, trustLevel: 0 })),
  newId: () => NEW_DOC,
}));
vi.mock("../documents/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../documents/storage")>();
  const { notFound } = await import("../errors");
  return {
    ...real,
    ...storage,
    documentsEnabled: () => state.enabled,
    requireDocumentsEnabled: () => {
      if (!state.enabled) throw notFound("Document uploads are not available");
    },
  };
});

import { GET as list, POST as start } from "@/app/api/tasks/[id]/documents/route";
import { POST as complete } from "@/app/api/tasks/[id]/documents/[documentId]/complete/route";
import { GET as download, DELETE as remove } from "@/app/api/tasks/[id]/documents/[documentId]/route";
import { NO_DOCUMENT_ACCESS } from "../documents/task-documents";

const req = (method: string, body?: unknown) =>
  new Request(`https://www.gideontasks.com/api/tasks/${TASK}/documents`, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const taskParams = { params: Promise.resolve({ id: TASK }) };
const docParams = { params: Promise.resolve({ id: TASK, documentId: DOC }) };
const pdf = { file_name: "W-2 2025.pdf", content_type: "application/pdf", size_bytes: 1234 };

const roles = {
  requester: { userId: REQUESTER, isAdmin: false },
  assignedTasker: { userId: DOER, isAdmin: false },
  otherApplicant: { userId: OTHER_APPLICANT, isAdmin: false },
  stranger: { userId: STRANGER, isAdmin: false },
  admin: { userId: ADMIN, isAdmin: true },
};

const uploadedByRequester = {
  id: DOC,
  task_id: TASK,
  uploader_id: REQUESTER,
  pathname: `tasks/${TASK}/${DOC}.pdf`,
  display_name: "W-2 2025.pdf",
  content_type: "application/pdf",
  size_bytes: "1234",
  status: "uploaded",
  created_at: "2026-11-21T15:00:00Z",
  uploaded_at: "2026-11-21T15:01:00Z",
};

const auditActions = () => (audit.logAudit.mock.calls as unknown as unknown[][]).map((c) => c[1]);

beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = true;
  state.actor = roles.requester;
  state.task = {
    id: TASK,
    requester_id: REQUESTER,
    assigned_doer_id: DOER,
    status: "in_progress",
    updated_at: "2026-11-21T14:00:00Z",
    category_slug: "tax-prep",
  };
  state.doc = { ...uploadedByRequester };
  state.insertAllowed = true;
  state.blob = { size: 1234, contentType: "application/pdf" };
  state.head = new TextEncoder().encode("%PDF-1.7");
});

describe("who can list, download, upload and delete", () => {
  it.each([
    ["requester", roles.requester, true],
    ["assigned tasker", roles.assignedTasker, true],
    ["other applicant", roles.otherApplicant, false],
    ["stranger", roles.stranger, false],
    ["admin, no dispute open", roles.admin, false],
  ])("%s", async (_label, actor, allowed) => {
    state.actor = actor;
    const listed = await list(req("GET"), taskParams);
    const downloaded = await download(req("GET"), docParams);
    const started = await start(req("POST", pdf), taskParams);
    if (allowed) {
      expect(listed.status).toBe(200);
      expect(downloaded.status).toBe(200);
      expect(started.status).toBe(201);
    } else {
      for (const res of [listed, downloaded, started]) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: NO_DOCUMENT_ACCESS });
      }
      expect(storage.blobStream).not.toHaveBeenCalled();
      expect(storage.issueUploadToken).not.toHaveBeenCalled();
    }
  });

  it("lets an admin list and download, but not upload or delete, while a dispute is open, and audits each look", async () => {
    state.actor = roles.admin;
    state.task = { ...state.task, status: "disputed" };

    const listed = await list(req("GET"), taskParams);
    expect(listed.status).toBe(200);
    expect((await listed.json()).access).toBe("admin_dispute");
    expect((await download(req("GET"), docParams)).status).toBe(200);
    expect(auditActions()).toEqual(["task_document.listed_by_admin", "task_document.downloaded"]);
    expect(audit.logAudit).toHaveBeenLastCalledWith(ADMIN, "task_document.downloaded", "task_document", DOC, null, {
      task_id: TASK,
      access: "admin_dispute",
    });

    expect((await start(req("POST", pdf), taskParams)).status).toBe(403);
    expect((await remove(req("DELETE"), docParams)).status).toBe(403);
    expect(storage.deleteBlob).not.toHaveBeenCalled();
  });

  it("lets only the uploader delete a file", async () => {
    state.actor = roles.assignedTasker;
    const res = await remove(req("DELETE"), docParams);
    expect(res.status).toBe(403);
    expect(storage.deleteBlob).not.toHaveBeenCalled();

    state.actor = roles.requester;
    expect((await remove(req("DELETE"), docParams)).status).toBe(200);
    expect(storage.deleteBlob).toHaveBeenCalledWith(uploadedByRequester.pathname);
    expect(audit.logAudit).toHaveBeenCalledWith(REQUESTER, "task_document.deleted", "task_document", DOC, null, {
      task_id: TASK,
      reason: "uploader",
    });
  });

  it("refuses a task in another category, or one not yet assigned", async () => {
    state.task = { ...state.task, category_slug: "tutoring" };
    expect((await list(req("GET"), taskParams)).status).toBe(403);
    state.task = { ...state.task, category_slug: "tax-prep", status: "published", assigned_doer_id: null };
    expect((await start(req("POST", pdf), taskParams)).status).toBe(403);
  });

  it("lets the two of them download but not add files after the task closes", async () => {
    state.task = { ...state.task, status: "completed" };
    expect((await download(req("GET"), docParams)).status).toBe(200);
    const listed = await (await list(req("GET"), taskParams)).json();
    expect(listed.can_upload).toBe(false);
    expect(listed.delete_after).toBe("2026-12-21T14:00:00.000Z");
    expect((await start(req("POST", pdf), taskParams)).status).toBe(403);
  });

  it("is off, with 404s, when storage isn't set up", async () => {
    state.enabled = false;
    for (const res of [
      await list(req("GET"), taskParams),
      await start(req("POST", pdf), taskParams),
      await download(req("GET"), docParams),
      await remove(req("DELETE"), docParams),
      await complete(req("POST"), docParams),
    ]) {
      expect(res.status).toBe(404);
    }
    expect(db.queryOne).not.toHaveBeenCalled();
  });
});

describe("downloads", () => {
  it("stream the file as an attachment, and are audited before the file is read", async () => {
    const res = await download(req("GET"), docParams);
    expect(res.headers.get("content-disposition")).toContain('filename="W-2 2025.pdf"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).toBe("%PDF-1.7");
    expect(audit.logAudit.mock.invocationCallOrder[0]).toBeLessThan(storage.blobStream.mock.invocationCallOrder[0]);
  });

  it("never send the storage pathname in the list", async () => {
    const body = await (await list(req("GET"), taskParams)).json();
    expect(JSON.stringify(body)).not.toContain("tasks/");
    expect(body.documents[0]).toMatchObject({ id: DOC, display_name: "W-2 2025.pdf", size_bytes: 1234, mine: true });
  });
});

describe("starting an upload", () => {
  it("records a pending file and issues a token for a server-chosen pathname", async () => {
    const res = await start(req("POST", pdf), taskParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.pathname).toBe(`tasks/${TASK}/${NEW_DOC}.pdf`);
    expect(body.document_id).toBe(NEW_DOC);
    expect(storage.issueUploadToken).toHaveBeenCalledWith(`tasks/${TASK}/${NEW_DOC}.pdf`, "application/pdf");
    const insert = (db.queryOne.mock.calls as unknown as [string, unknown[]][]).find(([sql]) =>
      sql.includes("INSERT INTO task_documents"),
    )!;
    expect(insert[1]).toEqual([NEW_DOC, TASK, REQUESTER, `tasks/${TASK}/${NEW_DOC}.pdf`, "W-2 2025.pdf", "application/pdf", 25]);
  });

  it.each([
    [{ ...pdf, content_type: "text/html", file_name: "x.html" }, /Only PDF, JPEG, PNG and HEIC/],
    [{ ...pdf, size_bytes: 20 * 1024 * 1024 + 1 }, /up to 20 MB/],
    [{ ...pdf, file_name: "x.png" }, /extension doesn't match/],
  ])("refuses a file that breaks the rules before issuing a token", async (meta, message) => {
    const res = await start(req("POST", meta), taskParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(message);
    expect(storage.issueUploadToken).not.toHaveBeenCalled();
  });

  it("refuses more than 25 files on a task", async () => {
    state.insertAllowed = false;
    const res = await start(req("POST", pdf), taskParams);
    expect(res.status).toBe(409);
    expect(storage.issueUploadToken).not.toHaveBeenCalled();
  });
});

describe("finishing an upload", () => {
  beforeEach(() => {
    state.doc = { ...uploadedByRequester, status: "pending", size_bytes: null, uploaded_at: null };
  });

  it("checks the file and audits the upload, with no file contents", async () => {
    const res = await complete(req("POST"), docParams);
    expect(res.status).toBe(200);
    expect(audit.logAudit).toHaveBeenCalledWith(REQUESTER, "task_document.uploaded", "task_document", DOC, null, {
      task_id: TASK,
      content_type: "application/pdf",
      size_bytes: 1234,
    });
  });

  it("is only for the uploader", async () => {
    state.actor = roles.assignedTasker;
    expect((await complete(req("POST"), docParams)).status).toBe(403);
    state.actor = roles.stranger;
    expect((await complete(req("POST"), docParams)).status).toBe(403);
  });

  it("asks to retry when nothing arrived", async () => {
    state.blob = null;
    const res = await complete(req("POST"), docParams);
    expect(res.status).toBe(409);
    expect(storage.deleteBlob).not.toHaveBeenCalled();
  });

  it.each([
    ["a file whose bytes aren't a PDF", { head: new TextEncoder().encode("<html>") }],
    ["a file of another type", { blob: { size: 1234, contentType: "text/html" } }],
    ["a file over the limit", { blob: { size: 20 * 1024 * 1024 + 1, contentType: "application/pdf" } }],
  ])("deletes %s and records why", async (_label, over) => {
    Object.assign(state, over);
    const res = await complete(req("POST"), docParams);
    expect(res.status).toBe(422);
    expect(storage.deleteBlob).toHaveBeenCalledWith(uploadedByRequester.pathname);
    expect(audit.logAudit).toHaveBeenCalledWith(REQUESTER, "task_document.deleted", "task_document", DOC, null, {
      task_id: TASK,
      reason: "invalid",
    });
  });
});
