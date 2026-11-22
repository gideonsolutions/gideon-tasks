import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Proof documents: the tasker uploads, lists, downloads and withdraws their
 * own; admins review them in the queue, open them (audited), and approve by
 * recording the PTIN or credential with the existing record action, or
 * reject with a note. The database, auth, audit log and storage are mocked.
 */

const TASKER = "0190d0c0-0000-7000-8000-00000000b001";
const OTHER = "0190d0c0-0000-7000-8000-00000000b002";
const ADMIN = "0190d0c0-0000-7000-8000-00000000b003";
const PROOF = "0190d0c0-0000-7000-8000-00000000c001";
const NEW_ID = "0190d0c0-0000-7000-8000-00000000c0ff";

const proofRow = (over: Record<string, unknown> = {}) => ({
  id: PROOF,
  user_id: TASKER,
  kind: "ptin",
  pathname: `proofs/${TASKER}/${PROOF}.pdf`,
  display_name: "PTIN letter.pdf",
  content_type: "application/pdf",
  size_bytes: "2048",
  status: "pending",
  review_note: null,
  reviewed_by: null,
  reviewed_at: null,
  file_deleted_at: null,
  created_at: "2026-11-21T15:00:00Z",
  uploaded_at: "2026-11-21T15:01:00Z",
  ...over,
});

const userRow = {
  id: TASKER,
  legal_first_name: "Kitty",
  legal_last_name: "Cats",
  email: "kitty@example.com",
  status: "active",
  ptin: null,
  ptin_year: null,
  ptin_note: null,
  ptin_recorded_at: null,
  ptin_recorded_by: null,
  tax_credential: null,
  tax_credential_note: null,
  tax_credential_recorded_at: null,
  tax_credential_recorded_by: null,
};

const state = vi.hoisted(() => ({
  actor: { userId: "", isAdmin: false, mfa: true },
  twoStepOn: true,
  proof: null as Record<string, unknown> | null,
  openCount: 0,
}));

const db = vi.hoisted(() => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes("FROM preparer_proofs p JOIN users u")) {
      return state.proof && state.proof.status === "pending"
        ? [{ ...state.proof, legal_first_name: "Kitty", legal_last_name: "Cats", email: "kitty@example.com", user_status: "active", ptin_year: null, tax_credential: null }]
        : [];
    }
    if (sql.includes("FROM preparer_proofs") && sql.includes("WHERE user_id = $1")) {
      return state.proof ? [state.proof] : [];
    }
    throw new Error(`Unexpected query: ${sql}`);
  }),
  queryOne: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SELECT totp_enabled_at FROM users WHERE id = $1")) {
      return { totp_enabled_at: state.twoStepOn ? "2026-11-01T00:00:00Z" : null };
    }
    if (sql.includes("INSERT INTO preparer_proofs")) return state.openCount < 5 ? { id: params[0] } : null;
    if (sql.includes("FROM preparer_proofs WHERE id = $1")) return state.proof;
    if (sql.startsWith("UPDATE preparer_proofs SET status = 'pending'")) {
      state.proof = { ...state.proof, status: "pending", size_bytes: params[0] };
      return state.proof;
    }
    if (sql.startsWith("UPDATE preparer_proofs SET status = 'approved'")) {
      if (state.proof?.status !== "pending") return null;
      state.proof = { ...state.proof, status: "approved", review_note: params[0], reviewed_by: params[1], reviewed_at: "2026-11-21T16:00:00Z" };
      return { id: PROOF };
    }
    if (sql.startsWith("UPDATE preparer_proofs SET status = 'rejected'")) {
      if (state.proof?.status !== "pending") return null;
      state.proof = { ...state.proof, status: "rejected", review_note: params[0], reviewed_by: params[1], reviewed_at: "2026-11-21T16:00:00Z" };
      return state.proof;
    }
    if (sql.startsWith("UPDATE preparer_proofs SET status = 'withdrawn'")) return { id: PROOF };
    // The tax-preparer record action
    if (sql.startsWith("SELECT id FROM users WHERE ptin = $1")) return null;
    if (sql.includes("FROM users WHERE id = $1")) return userRow;
    if (sql.startsWith("UPDATE users SET ptin = $1")) {
      return { ...userRow, ptin: params[0], ptin_year: params[1], ptin_note: params[2], ptin_recorded_by: params[3] };
    }
    if (sql.startsWith("UPDATE users SET tax_credential = $1")) {
      return { ...userRow, tax_credential: params[0], tax_credential_note: params[1] };
    }
    throw new Error(`Unexpected queryOne: ${sql}`);
  }),
  execute: vi.fn(async () => {}),
}));
const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => {}) }));
const storage = vi.hoisted(() => ({
  issueUploadToken: vi.fn(async () => ({ clientToken: "vercel_blob_client_x", validUntil: 1_800_000_000_000 })),
  blobInfo: vi.fn(async () => ({ size: 2048, contentType: "application/pdf" })),
  blobFirstBytes: vi.fn(async () => new TextEncoder().encode("%PDF-1.4")),
  blobStream: vi.fn(async () => ({ stream: new Blob(["%PDF-1.4"]).stream(), contentType: "application/pdf", size: 8 })),
  deleteBlob: vi.fn(async () => {}),
}));

vi.mock("../db", () => db);
vi.mock("../audit", () => audit);
vi.mock("../auth", async () => {
  const { forbidden } = await import("../errors");
  return {
    requireAuth: vi.fn(async () => ({ ...state.actor, trustLevel: 0 })),
    requireAdmin: vi.fn(async () => {
      if (!state.actor.isAdmin) throw forbidden("Admin access required");
      return { ...state.actor, trustLevel: 3 };
    }),
    newId: () => NEW_ID,
  };
});
vi.mock("../documents/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../documents/storage")>()),
  ...storage,
  documentsEnabled: () => true,
  requireDocumentsEnabled: () => {},
}));

import { GET as listMine, POST as startMine } from "@/app/api/users/me/preparer-proofs/route";
import { POST as completeMine } from "@/app/api/users/me/preparer-proofs/[proofId]/complete/route";
import { GET as downloadMine, DELETE as withdrawMine } from "@/app/api/users/me/preparer-proofs/[proofId]/route";
import { GET as queue } from "@/app/api/admin/preparer-proofs/route";
import { GET as adminOpen } from "@/app/api/admin/preparer-proofs/[proofId]/file/route";
import { POST as adminReject } from "@/app/api/admin/preparer-proofs/[proofId]/reject/route";
import { POST as recordPreparer } from "@/app/api/admin/users/[id]/tax-preparer/route";

const req = (method: string, body?: unknown) =>
  new Request("https://www.gideontasks.com/api/x", {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const proofParams = { params: Promise.resolve({ proofId: PROOF }) };
const userParams = { params: Promise.resolve({ id: TASKER }) };
const actions = () => (audit.logAudit.mock.calls as unknown as unknown[][]).map((c) => c[1]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
  state.actor = { userId: TASKER, isAdmin: false, mfa: true };
  state.twoStepOn = true;
  state.proof = proofRow();
  state.openCount = 0;
});
afterEach(() => vi.useRealTimers());

describe("the tasker's own proof documents", () => {
  it("starts an upload with a token for a server-chosen pathname", async () => {
    const res = await startMine(
      req("POST", { kind: "ptin", file_name: "PTIN letter.pdf", content_type: "application/pdf", size_bytes: 2048 }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).pathname).toBe(`proofs/${TASKER}/${NEW_ID}.pdf`);
    expect(storage.issueUploadToken).toHaveBeenCalledWith(`proofs/${TASKER}/${NEW_ID}.pdf`, "application/pdf");
  });

  it("refuses a sixth open document, and files that break the rules", async () => {
    state.openCount = 5;
    const meta = { kind: "cpa", file_name: "license.png", content_type: "image/png", size_bytes: 10 };
    expect((await startMine(req("POST", meta))).status).toBe(409);
    state.openCount = 0;
    expect((await startMine(req("POST", { ...meta, content_type: "image/gif", file_name: "a.gif" }))).status).toBe(400);
    expect((await startMine(req("POST", { ...meta, kind: "enrolled_actuary" }))).status).toBe(400);
    expect(storage.issueUploadToken).not.toHaveBeenCalled();
  });

  it("finishes an upload into the review queue, audited", async () => {
    state.proof = proofRow({ status: "uploading" });
    const res = await completeMine(req("POST"), proofParams);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("pending");
    expect(audit.logAudit).toHaveBeenCalledWith(TASKER, "preparer_proof.uploaded", "preparer_proof", PROOF, null, {
      kind: "ptin",
      content_type: "application/pdf",
      size_bytes: 2048,
    });
  });

  it("lists, downloads (audited) and withdraws (deleting the file) only their own", async () => {
    expect((await listMine(req("GET"))).status).toBe(200);
    expect((await downloadMine(req("GET"), proofParams)).status).toBe(200);
    expect(actions()).toContain("preparer_proof.downloaded");
    expect((await withdrawMine(req("DELETE"), proofParams)).status).toBe(200);
    expect(storage.deleteBlob).toHaveBeenCalledWith(`proofs/${TASKER}/${PROOF}.pdf`);
    expect(actions()).toContain("preparer_proof.withdrawn");
  });

  it("hides another user's proof as not found", async () => {
    state.actor = { userId: OTHER, isAdmin: false, mfa: true };
    expect((await downloadMine(req("GET"), proofParams)).status).toBe(404);
    expect((await withdrawMine(req("DELETE"), proofParams)).status).toBe(404);
    expect((await completeMine(req("POST"), proofParams)).status).toBe(404);
    expect(storage.blobStream).not.toHaveBeenCalled();
    expect(storage.deleteBlob).not.toHaveBeenCalled();
  });

  it("can't withdraw a document after the decision", async () => {
    state.proof = proofRow({ status: "approved", reviewed_at: "2026-11-21T16:00:00Z" });
    expect((await withdrawMine(req("DELETE"), proofParams)).status).toBe(409);
  });

  it("shows a rejection's note to the tasker, but not an approval's", async () => {
    state.proof = proofRow({ status: "rejected", review_note: "This letter is for 2025", reviewed_at: "2026-11-21T16:00:00Z" });
    const [rejected] = await (await listMine(req("GET"))).json();
    expect(rejected.review_note).toBe("This letter is for 2025");
    expect(rejected.delete_after).toBe("2027-02-19T16:00:00.000Z");
    state.proof = proofRow({ status: "approved", review_note: "Directory checked", reviewed_at: "2026-11-21T16:00:00Z" });
    const [approved] = await (await listMine(req("GET"))).json();
    expect(approved.review_note).toBeNull();
  });
});

describe("the admin review queue", () => {
  it("is for admins only", async () => {
    expect((await queue(req("GET"))).status).toBe(403);
    expect((await adminOpen(req("GET"), proofParams)).status).toBe(403);
    expect((await adminReject(req("POST", { note: "x" }), proofParams)).status).toBe(403);
    expect(storage.blobStream).not.toHaveBeenCalled();
  });

  it("lists pending documents with who sent them", async () => {
    state.actor = { userId: ADMIN, isAdmin: true, mfa: true };
    const body = await (await queue(req("GET"))).json();
    expect(body.recordable_years).toEqual([2026]);
    expect(body.proofs).toHaveLength(1);
    expect(body.proofs[0].user).toMatchObject({ id: TASKER, email: "kitty@example.com" });
    expect(JSON.stringify(body)).not.toContain("proofs/");
  });

  it("audits every time an admin opens a document", async () => {
    state.actor = { userId: ADMIN, isAdmin: true, mfa: true };
    expect((await adminOpen(req("GET"), proofParams)).status).toBe(200);
    expect(audit.logAudit).toHaveBeenCalledWith(ADMIN, "preparer_proof.downloaded", "preparer_proof", PROOF, null, {
      access: "admin",
      user_id: TASKER,
    });
  });

  it("can't open a document whose file was deleted", async () => {
    state.actor = { userId: ADMIN, isAdmin: true, mfa: true };
    state.proof = proofRow({ status: "approved", file_deleted_at: "2027-02-19T16:00:00Z" });
    expect((await adminOpen(req("GET"), proofParams)).status).toBe(404);
  });

  it("rejects with a note, once", async () => {
    state.actor = { userId: ADMIN, isAdmin: true, mfa: true };
    expect((await adminReject(req("POST", { note: " " }), proofParams)).status).toBe(400);
    const res = await adminReject(req("POST", { note: "Send the 2026 confirmation" }), proofParams);
    expect(res.status).toBe(200);
    expect(actions()).toContain("preparer_proof.rejected");
    expect((await adminReject(req("POST", { note: "again" }), proofParams)).status).toBe(409);
  });

  describe("approving with the existing record action", () => {
    beforeEach(() => {
      state.actor = { userId: ADMIN, isAdmin: true, mfa: true };
    });

    const recordPtin = {
      action: "record_ptin",
      ptin: "P01234567",
      year: 2026,
      note: "PTIN letter for 2026; IRS directory lists her",
      confirms_current_ptin: true,
      proof_id: PROOF,
    };

    it("records the PTIN and marks the document approved, auditing both", async () => {
      const res = await recordPreparer(req("POST", recordPtin), userParams);
      expect(res.status).toBe(200);
      expect((await res.json()).ptin).toBe("P01234567");
      expect(state.proof?.status).toBe("approved");
      expect(actions()).toEqual(["admin.user.ptin_recorded", "preparer_proof.approved"]);
    });

    it("records a credential from a credential document", async () => {
      state.proof = proofRow({ kind: "enrolled_agent" });
      const res = await recordPreparer(
        req("POST", {
          action: "record_credential",
          credential: "enrolled_agent",
          note: "Enrollment card",
          confirms_credential: true,
          proof_id: PROOF,
        }),
        userParams,
      );
      expect(res.status).toBe(200);
      expect(actions()).toEqual(["admin.user.tax_credential_recorded", "preparer_proof.approved"]);
    });

    it("refuses a document of another kind, without recording anything", async () => {
      state.proof = proofRow({ kind: "cpa" });
      const res = await recordPreparer(req("POST", recordPtin), userParams);
      expect(res.status).toBe(400);
      expect(audit.logAudit).not.toHaveBeenCalled();
    });

    it("refuses another user's document, or one already decided", async () => {
      state.proof = proofRow({ user_id: OTHER });
      expect((await recordPreparer(req("POST", recordPtin), userParams)).status).toBe(404);
      state.proof = proofRow({ status: "rejected" });
      expect((await recordPreparer(req("POST", recordPtin), userParams)).status).toBe(409);
      expect(audit.logAudit).not.toHaveBeenCalled();
    });

    it("still records without a document, as before", async () => {
      const { proof_id: _p, ...noProof } = recordPtin;
      void _p;
      expect((await recordPreparer(req("POST", noProof), userParams)).status).toBe(200);
      expect(actions()).toEqual(["admin.user.ptin_recorded"]);
    });
  });
});

describe("two-step sign-in is required on every proof and review route", () => {
  const taskerRoutes = () => [
    () => listMine(req("GET")),
    () => startMine(req("POST", { kind: "ptin", file_name: "a.pdf", content_type: "application/pdf", size_bytes: 10 })),
    () => completeMine(req("POST"), proofParams),
    () => downloadMine(req("GET"), proofParams),
    () => withdrawMine(req("DELETE"), proofParams),
  ];
  const adminRoutes = () => [
    () => queue(req("GET")),
    () => adminOpen(req("GET"), proofParams),
    () => adminReject(req("POST", { note: "x" }), proofParams),
    () =>
      recordPreparer(
        req("POST", {
          action: "record_ptin",
          ptin: "P01234567",
          year: 2026,
          note: "x",
          confirms_current_ptin: true,
          proof_id: PROOF,
        }),
        userParams,
      ),
  ];

  it.each([
    ["the account doesn't have it", false, true],
    ["the session didn't pass it", true, false],
  ])("refuses a tasker when %s", async (_label, twoStepOn, mfa) => {
    state.twoStepOn = twoStepOn;
    state.actor = { userId: TASKER, isAdmin: false, mfa };
    for (const call of taskerRoutes()) {
      const res = await call();
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("two_step_required");
    }
    expect(storage.issueUploadToken).not.toHaveBeenCalled();
    expect(storage.blobStream).not.toHaveBeenCalled();
    expect(storage.deleteBlob).not.toHaveBeenCalled();
  });

  it.each([
    ["the account doesn't have it", false, true],
    ["the session didn't pass it", true, false],
  ])("refuses an admin when %s, including approving from a proof", async (_label, twoStepOn, mfa) => {
    state.twoStepOn = twoStepOn;
    state.actor = { userId: ADMIN, isAdmin: true, mfa };
    for (const call of adminRoutes()) {
      const res = await call();
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("two_step_required");
    }
    expect(storage.blobStream).not.toHaveBeenCalled();
    expect(audit.logAudit).not.toHaveBeenCalled();
    expect(state.proof?.status).toBe("pending");
  });

  it("still lets an admin record a PTIN without a proof, as before", async () => {
    state.twoStepOn = false;
    state.actor = { userId: ADMIN, isAdmin: true, mfa: false };
    const res = await recordPreparer(
      req("POST", { action: "record_ptin", ptin: "P01234567", year: 2026, note: "x", confirms_current_ptin: true }),
      userParams,
    );
    expect(res.status).toBe(200);
  });
});
