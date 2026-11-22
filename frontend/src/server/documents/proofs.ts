import "server-only";
import { queryOne } from "../db";
import { notFound } from "../errors";
import { proofDeleteAfter, type ProofKind } from "./rules";

// Proof documents: a tasker who wants Tax Prep work uploads proof of their
// PTIN (and, if they have one, their credential). Only the uploader and
// admins can see them. An admin opens the file, then records the PTIN or
// credential with the existing record action on
// /api/admin/users/[id]/tax-preparer (passing proof_id), or rejects it with
// a note the tasker sees. The file is deleted PROOF_RETENTION_DAYS after the
// decision (src/server/documents/retention.ts).

export type ProofStatus = "uploading" | "pending" | "approved" | "rejected" | "withdrawn" | "abandoned";

export interface ProofRow {
  id: string;
  user_id: string;
  kind: ProofKind;
  pathname: string;
  display_name: string | null;
  content_type: string;
  size_bytes: number | string | null;
  status: ProofStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  file_deleted_at: string | null;
  created_at: string;
  uploaded_at: string | null;
}

const PROOF_COLUMN_NAMES = [
  "id", "user_id", "kind", "pathname", "display_name", "content_type", "size_bytes",
  "status", "review_note", "reviewed_by", "reviewed_at", "file_deleted_at", "created_at", "uploaded_at",
];

/** SELECT list for ProofRow, optionally under a table alias (e.g. "p."). */
export function proofColumns(alias = ""): string {
  return PROOF_COLUMN_NAMES.map((c) => alias + c).join(", ");
}

export const PROOF_COLUMNS = proofColumns();

export async function loadProof(proofId: string): Promise<ProofRow> {
  const p = await queryOne<ProofRow>(`SELECT ${PROOF_COLUMNS} FROM preparer_proofs WHERE id = $1`, [proofId]);
  if (!p) throw notFound("Document not found");
  return p;
}

/** What the tasker (and the admin queue) sees about a proof. Never the storage pathname. */
export function proofView(p: ProofRow) {
  return {
    id: p.id,
    kind: p.kind,
    display_name: p.display_name,
    content_type: p.content_type,
    size_bytes: p.size_bytes == null ? null : Number(p.size_bytes),
    status: p.status,
    // A rejection note is written for the tasker; an approval's note is the admin's own.
    review_note: p.status === "rejected" ? p.review_note : null,
    reviewed_at: p.reviewed_at,
    uploaded_at: p.uploaded_at,
    file_deleted: p.file_deleted_at != null,
    delete_after: p.file_deleted_at ? null : (proofDeleteAfter(p.reviewed_at)?.toISOString() ?? null),
  };
}

/** Whether the proof's file can still be opened. */
export function proofFileAvailable(p: ProofRow): boolean {
  return p.file_deleted_at == null && ["pending", "approved", "rejected"].includes(p.status);
}
