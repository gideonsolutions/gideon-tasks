// Secure documents: which files are allowed, who may see them, and when they
// are deleted. Pure (no database, no storage), so the pages, the API and the
// retention job share one definition. The policy is on /tax-prep#documents.
//
// Files live in a private Vercel Blob store (src/server/documents/storage.ts).
// They are never public: the browser uploads straight to the store with a
// short-lived token the server issues for one pathname, and every download
// goes through an authorized route.

import { IRS_HELP_SLUG, TAX_PREP_SLUG } from "../tax-preparers";
import { containsSsnOrItin } from "../moderation";

/** The categories whose tasks can hold documents. */
export const DOCUMENT_CATEGORY_SLUGS: readonly string[] = [TAX_PREP_SLUG, IRS_HELP_SLUG];

/** PDF, JPEG, PNG and HEIC only, with the extensions each may have. */
export const DOCUMENT_TYPES = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/heic": ["heic"],
} as const;

export type DocumentContentType = keyof typeof DOCUMENT_TYPES;

export const DOCUMENT_CONTENT_TYPES = Object.keys(DOCUMENT_TYPES) as DocumentContentType[];

/** For a file input's accept attribute. */
export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/jpeg,image/png,image/heic";

/** 20 MB per file. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** Files on one task, counting both people's and uploads in progress. */
export const MAX_DOCUMENTS_PER_TASK = 25;

/** Proof documents one tasker may have uploading or waiting for review. */
export const MAX_OPEN_PROOFS_PER_USER = 5;

/** Files on a task are deleted this many days after it is completed, cancelled or resolved. */
export const TASK_DOCUMENT_RETENTION_DAYS = 30;

/** A proof document is deleted this many days after an admin approves or rejects it. */
export const PROOF_RETENTION_DAYS = 90;

/** An upload that never finishes is cleaned up after this many hours. */
export const ABANDONED_UPLOAD_HOURS = 24;

/** How long an upload token is valid. */
export const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * How long Vercel's CDN may cache a private blob between the store and our
 * route (the minimum is one minute), so a deleted file stops being served
 * within a minute. Downloads also read with useCache: false.
 */
export const BLOB_CACHE_MAX_AGE_SECS = 60;

const DAY_MS = 86_400_000;

export function isDocumentContentType(v: unknown): v is DocumentContentType {
  return typeof v === "string" && v in DOCUMENT_TYPES;
}

/** The lower-case extension of a file name, or "" if it has none. */
export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** The content type for a file name's extension, or null if it isn't allowed. */
export function contentTypeForName(name: string): DocumentContentType | null {
  const ext = fileExtension(name);
  for (const type of DOCUMENT_CONTENT_TYPES) {
    if ((DOCUMENT_TYPES[type] as readonly string[]).includes(ext)) return type;
  }
  return null;
}

/**
 * A file name safe to store and show: no path, no control or markup
 * characters, at most 120 characters, keeping its extension.
 */
export function sanitizeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 120) return cleaned || "document";
  const ext = fileExtension(cleaned);
  const keep = ext ? 120 - ext.length - 1 : 120;
  return ext ? `${cleaned.slice(0, keep)}.${ext}` : cleaned.slice(0, 120);
}

export interface FileMeta {
  file_name: string;
  content_type: string;
  size_bytes: number;
}

export type FileCheck =
  | { ok: true; contentType: DocumentContentType; extension: string; displayName: string }
  | { ok: false; error: string };

/**
 * Checks what the browser says about a file before an upload token is
 * issued: an allowed type whose extension matches, a size within the limit,
 * and a name without a Social Security number or ITIN in it.
 */
export function checkFileMeta(f: FileMeta): FileCheck {
  const displayName = sanitizeDisplayName(f.file_name);
  if (!isDocumentContentType(f.content_type)) {
    return { ok: false, error: "Only PDF, JPEG, PNG and HEIC files can be uploaded" };
  }
  const extension = fileExtension(displayName);
  if (!(DOCUMENT_TYPES[f.content_type] as readonly string[]).includes(extension)) {
    return { ok: false, error: "The file's extension doesn't match its type. Use .pdf, .jpg, .png or .heic" };
  }
  if (!Number.isInteger(f.size_bytes) || f.size_bytes <= 0) {
    return { ok: false, error: "The file is empty" };
  }
  if (f.size_bytes > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: `Files can be up to ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB` };
  }
  if (containsSsnOrItin(displayName)) {
    return {
      ok: false,
      error: "Rename the file: its name contains a Social Security number or ITIN",
    };
  }
  return { ok: true, contentType: f.content_type, extension, displayName };
}

/**
 * Whether a file's first bytes match its declared type, so an upload that
 * claims to be a PDF or an image is one. HEIC is an ISO base media file whose
 * "ftyp" box names a HEIF brand.
 */
export function sniffMatches(contentType: DocumentContentType, head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  switch (contentType) {
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => head[i] === b);
    case "image/heic":
      return (
        ascii(4, 8) === "ftyp" &&
        ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(ascii(8, 12))
      );
  }
}

/** Where a task's file lives in the store. No user-supplied text goes in it. */
export function taskDocumentPathname(taskId: string, documentId: string, extension: string): string {
  return `tasks/${taskId}/${documentId}.${extension}`;
}

/** Where a proof document lives in the store. */
export function proofPathname(userId: string, proofId: string, extension: string): string {
  return `proofs/${userId}/${proofId}.${extension}`;
}

// ─── Who may see a task's files ──────────────────────────

/** Task statuses in which a doer has been assigned and files can be added. */
export const DOCUMENT_UPLOAD_STATUSES: readonly string[] = ["assigned", "in_progress", "submitted", "disputed"];

/** Task statuses after which the files are kept for TASK_DOCUMENT_RETENTION_DAYS, then deleted. */
export const DOCUMENT_CLOSED_STATUSES: readonly string[] = ["completed", "cancelled", "resolved"];

export interface DocumentTask {
  requester_id: string;
  assigned_doer_id: string | null;
  status: string;
  category_slug: string | null;
}

export interface DocumentViewer {
  userId: string;
  isAdmin: boolean;
}

/**
 * How someone may see a task's files:
 * - "participant": the requester, or the assigned doer, of a Tax Prep or IRS
 *   Notices & Representation task once a doer is assigned;
 * - "admin_dispute": an admin, only while a dispute is open on the task
 *   (every such access is written to the audit log);
 * - null: nobody else, including other applicants and the public.
 */
export function taskDocumentAccess(
  task: DocumentTask | null | undefined,
  viewer: DocumentViewer,
): "participant" | "admin_dispute" | null {
  if (!task || !DOCUMENT_CATEGORY_SLUGS.includes(task.category_slug ?? "")) return null;
  if (!task.assigned_doer_id) return null;
  const hasBeenAssigned =
    DOCUMENT_UPLOAD_STATUSES.includes(task.status) || DOCUMENT_CLOSED_STATUSES.includes(task.status);
  if (!hasBeenAssigned) return null;
  if (viewer.userId === task.requester_id || viewer.userId === task.assigned_doer_id) {
    return "participant";
  }
  if (viewer.isAdmin && task.status === "disputed") return "admin_dispute";
  return null;
}

/** Whether a participant may add files now: from assignment until the task closes. */
export function canUploadTaskDocuments(task: DocumentTask, viewer: DocumentViewer): boolean {
  return (
    taskDocumentAccess(task, viewer) === "participant" && DOCUMENT_UPLOAD_STATUSES.includes(task.status)
  );
}

/** When a closed task's files are deleted, or null while the task is open. */
export function taskDocumentsDeleteAfter(task: { status: string; updated_at: string | Date }): Date | null {
  if (!DOCUMENT_CLOSED_STATUSES.includes(task.status)) return null;
  return new Date(new Date(task.updated_at).getTime() + TASK_DOCUMENT_RETENTION_DAYS * DAY_MS);
}

/** When a reviewed proof's file is deleted, or null until it is reviewed. */
export function proofDeleteAfter(reviewedAt: string | Date | null): Date | null {
  return reviewedAt ? new Date(new Date(reviewedAt).getTime() + PROOF_RETENTION_DAYS * DAY_MS) : null;
}

// ─── Proof documents ─────────────────────────────────────

/** What a proof document proves: the PTIN, or one of the credentials. */
export const PROOF_KINDS = ["ptin", "enrolled_agent", "cpa", "attorney"] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

export const PROOF_KIND_LABELS: Record<ProofKind, string> = {
  ptin: "PTIN (for example, the confirmation in your IRS Tax Pro Account or your PTIN letter)",
  enrolled_agent: "Enrolled Agent (your enrollment card)",
  cpa: "CPA (your license)",
  attorney: "Attorney (your bar admission)",
};

export function isProofKind(v: unknown): v is ProofKind {
  return typeof v === "string" && (PROOF_KINDS as readonly string[]).includes(v);
}
