import { describe, it, expect } from "vitest";
import {
  canUploadTaskDocuments,
  checkFileMeta,
  contentTypeForName,
  MAX_DOCUMENT_BYTES,
  proofDeleteAfter,
  proofPathname,
  sanitizeDisplayName,
  sniffMatches,
  taskDocumentAccess,
  taskDocumentPathname,
  taskDocumentsDeleteAfter,
  type DocumentTask,
} from "../documents/rules";

const REQUESTER = "0190d0c0-0000-7000-8000-00000000a001";
const DOER = "0190d0c0-0000-7000-8000-00000000a002";
const OTHER_APPLICANT = "0190d0c0-0000-7000-8000-00000000a003";
const STRANGER = "0190d0c0-0000-7000-8000-00000000a004";
const ADMIN = "0190d0c0-0000-7000-8000-00000000a005";

const task = (over: Partial<DocumentTask> = {}): DocumentTask => ({
  requester_id: REQUESTER,
  assigned_doer_id: DOER,
  status: "in_progress",
  category_slug: "tax-prep",
  ...over,
});

const as = (userId: string, isAdmin = false) => ({ userId, isAdmin });

describe("checkFileMeta: types, extensions and size", () => {
  it.each([
    ["W-2 2025.pdf", "application/pdf"],
    ["photo.JPG", "image/jpeg"],
    ["scan.jpeg", "image/jpeg"],
    ["letter.png", "image/png"],
    ["IMG_0042.HEIC", "image/heic"],
  ])("accepts %s as %s", (file_name, content_type) => {
    const r = checkFileMeta({ file_name, content_type, size_bytes: 1000 });
    expect(r.ok).toBe(true);
  });

  it.each([
    ["notes.txt", "text/plain"],
    ["page.html", "text/html"],
    ["book.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["vector.svg", "image/svg+xml"],
    ["clip.gif", "image/gif"],
    ["archive.zip", "application/zip"],
  ])("refuses %s (%s)", (file_name, content_type) => {
    const r = checkFileMeta({ file_name, content_type, size_bytes: 1000 });
    expect(r).toEqual({ ok: false, error: "Only PDF, JPEG, PNG and HEIC files can be uploaded" });
  });

  it("refuses an extension that doesn't match the type", () => {
    for (const [file_name, content_type] of [
      ["return.exe", "application/pdf"],
      ["return.html", "image/png"],
      ["return", "application/pdf"],
    ]) {
      expect(checkFileMeta({ file_name, content_type, size_bytes: 1000 }).ok).toBe(false);
    }
  });

  it("allows up to 20 MB, and nothing empty or larger", () => {
    const f = { file_name: "a.pdf", content_type: "application/pdf" };
    expect(checkFileMeta({ ...f, size_bytes: MAX_DOCUMENT_BYTES }).ok).toBe(true);
    expect(checkFileMeta({ ...f, size_bytes: MAX_DOCUMENT_BYTES + 1 })).toEqual({
      ok: false,
      error: "Files can be up to 20 MB",
    });
    expect(checkFileMeta({ ...f, size_bytes: 0 }).ok).toBe(false);
    expect(checkFileMeta({ ...f, size_bytes: -5 }).ok).toBe(false);
    expect(checkFileMeta({ ...f, size_bytes: 1.5 }).ok).toBe(false);
  });

  it("refuses a file name with a Social Security number in it", () => {
    const r = checkFileMeta({ file_name: "SSN 123-45-6789.pdf", content_type: "application/pdf", size_bytes: 10 });
    expect(r.ok).toBe(false);
  });

  it("finds the type from the extension when the browser gives none", () => {
    expect(contentTypeForName("IMG_1.heic")).toBe("image/heic");
    expect(contentTypeForName("a.PDF")).toBe("application/pdf");
    expect(contentTypeForName("a.txt")).toBeNull();
  });
});

describe("sanitizeDisplayName", () => {
  it("drops any path, control and markup characters, and keeps the extension", () => {
    expect(sanitizeDisplayName("C:\\Users\\kitty\\W-2.pdf")).toBe("W-2.pdf");
    expect(sanitizeDisplayName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeDisplayName('<script>"x".pdf')).toBe("scriptx.pdf");
    expect(sanitizeDisplayName("a\u0000b\nc.png")).toBe("abc.png");
    expect(sanitizeDisplayName("")).toBe("document");
  });

  it("shortens a long name to 120 characters with its extension", () => {
    const out = sanitizeDisplayName(`${"x".repeat(300)}.heic`);
    expect(out).toHaveLength(120);
    expect(out.endsWith(".heic")).toBe(true);
  });
});

describe("sniffMatches: the file is what it says", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  const ascii = (s: string) => new TextEncoder().encode(s);
  const heic = (brand: string) => new Uint8Array([0, 0, 0, 24, ...ascii("ftyp"), ...ascii(brand), 0, 0, 0, 0]);

  it("knows each allowed type", () => {
    expect(sniffMatches("application/pdf", ascii("%PDF-1.7\n"))).toBe(true);
    expect(sniffMatches("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(sniffMatches("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(sniffMatches("image/heic", heic("heic"))).toBe(true);
    expect(sniffMatches("image/heic", heic("mif1"))).toBe(true);
  });

  it("catches a file dressed up as another", () => {
    expect(sniffMatches("application/pdf", ascii("<html><body>"))).toBe(false);
    expect(sniffMatches("image/png", ascii("%PDF-1.7"))).toBe(false);
    expect(sniffMatches("image/jpeg", bytes(0x89, 0x50))).toBe(false);
    expect(sniffMatches("image/heic", heic("mp42"))).toBe(false);
    expect(sniffMatches("application/pdf", new Uint8Array())).toBe(false);
  });
});

describe("pathnames hold no user text", () => {
  it("are built from IDs and the extension only", () => {
    expect(taskDocumentPathname("t1", "d1", "pdf")).toBe("tasks/t1/d1.pdf");
    expect(proofPathname("u1", "p1", "heic")).toBe("proofs/u1/p1.heic");
  });
});

describe("taskDocumentAccess: who can see a task's files", () => {
  it("lets in the requester and the assigned tasker", () => {
    expect(taskDocumentAccess(task(), as(REQUESTER))).toBe("participant");
    expect(taskDocumentAccess(task(), as(DOER))).toBe("participant");
  });

  it("keeps out another applicant and a stranger", () => {
    expect(taskDocumentAccess(task(), as(OTHER_APPLICANT))).toBeNull();
    expect(taskDocumentAccess(task(), as(STRANGER))).toBeNull();
  });

  it("lets an admin in only while a dispute is open", () => {
    expect(taskDocumentAccess(task(), as(ADMIN, true))).toBeNull();
    expect(taskDocumentAccess(task({ status: "submitted" }), as(ADMIN, true))).toBeNull();
    expect(taskDocumentAccess(task({ status: "resolved" }), as(ADMIN, true))).toBeNull();
    expect(taskDocumentAccess(task({ status: "disputed" }), as(ADMIN, true))).toBe("admin_dispute");
  });

  it("treats an admin who is on the task as a participant", () => {
    expect(taskDocumentAccess(task({ requester_id: ADMIN }), as(ADMIN, true))).toBe("participant");
  });

  it("is for Tax Prep and IRS Notices & Representation only", () => {
    expect(taskDocumentAccess(task({ category_slug: "irs-help" }), as(REQUESTER))).toBe("participant");
    for (const category_slug of ["tutoring", "cleaning", null]) {
      expect(taskDocumentAccess(task({ category_slug }), as(REQUESTER))).toBeNull();
    }
  });

  it("starts once a tasker is assigned", () => {
    for (const status of ["draft", "pending_review", "published"]) {
      expect(taskDocumentAccess(task({ status, assigned_doer_id: null }), as(REQUESTER))).toBeNull();
    }
    expect(taskDocumentAccess(task({ status: "assigned" }), as(REQUESTER))).toBe("participant");
  });

  it("keeps the files visible to the two of them after the task closes", () => {
    for (const status of ["completed", "cancelled", "resolved"]) {
      expect(taskDocumentAccess(task({ status }), as(DOER))).toBe("participant");
    }
  });
});

describe("canUploadTaskDocuments", () => {
  it("is from assignment until the task closes, for the two of them", () => {
    for (const status of ["assigned", "in_progress", "submitted", "disputed"]) {
      expect(canUploadTaskDocuments(task({ status }), as(REQUESTER))).toBe(true);
    }
    for (const status of ["completed", "cancelled", "resolved"]) {
      expect(canUploadTaskDocuments(task({ status }), as(REQUESTER))).toBe(false);
    }
    expect(canUploadTaskDocuments(task({ status: "disputed" }), as(ADMIN, true))).toBe(false);
    expect(canUploadTaskDocuments(task(), as(STRANGER))).toBe(false);
  });
});

describe("retention dates", () => {
  it("deletes a closed task's files 30 days after it closed", () => {
    const closed = "2026-11-01T12:00:00Z";
    for (const status of ["completed", "cancelled", "resolved"]) {
      expect(taskDocumentsDeleteAfter({ status, updated_at: closed })?.toISOString()).toBe(
        "2026-12-01T12:00:00.000Z",
      );
    }
    expect(taskDocumentsDeleteAfter({ status: "in_progress", updated_at: closed })).toBeNull();
  });

  it("deletes a proof 90 days after the decision", () => {
    expect(proofDeleteAfter("2026-11-01T00:00:00Z")?.toISOString()).toBe("2027-01-30T00:00:00.000Z");
    expect(proofDeleteAfter(null)).toBeNull();
  });
});
