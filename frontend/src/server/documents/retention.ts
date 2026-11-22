import "server-only";
import { query, queryOne } from "../db";
import { logAudit } from "../audit";
import { deleteBlob } from "./storage";
import {
  ABANDONED_UPLOAD_HOURS,
  DOCUMENT_CLOSED_STATUSES,
  PROOF_RETENTION_DAYS,
  TASK_DOCUMENT_RETENTION_DAYS,
} from "./rules";

// The retention job (GET /api/cron/document-retention, daily). It deletes:
// - a task's files TASK_DOCUMENT_RETENTION_DAYS (30) after the task was
//   completed, cancelled or resolved (its last status change: a closed task's
//   status never changes again, so tasks.updated_at is that moment);
// - a proof document's file PROOF_RETENTION_DAYS (90) after an admin
//   approved or rejected it;
// - uploads that never finished, after ABANDONED_UPLOAD_HOURS (24).
// Each deletion is written to the audit log with no actor. A file whose
// deletion fails is left for the next run.

/** At most this many files per kind per run, so a run stays short. */
export const RETENTION_BATCH = 200;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface RetentionResult {
  task_documents_deleted: number;
  task_uploads_abandoned: number;
  proofs_deleted: number;
  proof_uploads_abandoned: number;
  failed: number;
}

async function removeEach<T extends { id: string; pathname: string }>(
  rows: T[],
  done: (row: T) => Promise<void>,
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deleteBlob(row.pathname);
    } catch (e) {
      console.error("Retention: could not delete a file; will retry next run", row.id, e);
      failed++;
      continue;
    }
    await done(row);
    deleted++;
  }
  return { deleted, failed };
}

export async function runDocumentRetention(now: Date = new Date()): Promise<RetentionResult> {
  const closedBefore = new Date(now.getTime() - TASK_DOCUMENT_RETENTION_DAYS * DAY_MS);
  const reviewedBefore = new Date(now.getTime() - PROOF_RETENTION_DAYS * DAY_MS);
  const abandonedBefore = new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * HOUR_MS);

  const closed = await query<{ id: string; task_id: string; pathname: string }>(
    `SELECT d.id, d.task_id, d.pathname
     FROM task_documents d JOIN tasks t ON t.id = d.task_id
     WHERE d.status <> 'deleted' AND t.status = ANY($1) AND t.updated_at < $2
     ORDER BY t.updated_at ASC LIMIT ${RETENTION_BATCH}`,
    [DOCUMENT_CLOSED_STATUSES as string[], closedBefore],
  );
  const a = await removeEach(closed, async (d) => {
    await queryOne(
      `UPDATE task_documents SET status = 'deleted', deleted_at = now(),
         deleted_reason = 'retention', display_name = NULL
       WHERE id = $1 RETURNING id`,
      [d.id],
    );
    await logAudit(null, "task_document.deleted", "task_document", d.id, null, {
      task_id: d.task_id,
      reason: "retention",
      retention_days: TASK_DOCUMENT_RETENTION_DAYS,
    });
  });

  const stale = await query<{ id: string; task_id: string; pathname: string }>(
    `SELECT id, task_id, pathname FROM task_documents
     WHERE status = 'pending' AND created_at < $1
     ORDER BY created_at ASC LIMIT ${RETENTION_BATCH}`,
    [abandonedBefore],
  );
  const b = await removeEach(stale, async (d) => {
    await queryOne(
      `UPDATE task_documents SET status = 'deleted', deleted_at = now(),
         deleted_reason = 'abandoned', display_name = NULL
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [d.id],
    );
    await logAudit(null, "task_document.deleted", "task_document", d.id, null, {
      task_id: d.task_id,
      reason: "abandoned",
    });
  });

  const reviewed = await query<{ id: string; pathname: string; status: string }>(
    `SELECT id, pathname, status FROM preparer_proofs
     WHERE status IN ('approved', 'rejected') AND file_deleted_at IS NULL AND reviewed_at < $1
     ORDER BY reviewed_at ASC LIMIT ${RETENTION_BATCH}`,
    [reviewedBefore],
  );
  const c = await removeEach(reviewed, async (p) => {
    await queryOne(
      `UPDATE preparer_proofs SET file_deleted_at = now(), display_name = NULL
       WHERE id = $1 RETURNING id`,
      [p.id],
    );
    await logAudit(null, "preparer_proof.file_deleted", "preparer_proof", p.id, null, {
      reason: "retention",
      retention_days: PROOF_RETENTION_DAYS,
      status: p.status,
    });
  });

  const unfinished = await query<{ id: string; pathname: string }>(
    `SELECT id, pathname FROM preparer_proofs
     WHERE status = 'uploading' AND created_at < $1
     ORDER BY created_at ASC LIMIT ${RETENTION_BATCH}`,
    [abandonedBefore],
  );
  const d = await removeEach(unfinished, async (p) => {
    await queryOne(
      `UPDATE preparer_proofs SET status = 'abandoned', file_deleted_at = now(), display_name = NULL
       WHERE id = $1 AND status = 'uploading' RETURNING id`,
      [p.id],
    );
    await logAudit(null, "preparer_proof.file_deleted", "preparer_proof", p.id, null, {
      reason: "abandoned",
    });
  });

  return {
    task_documents_deleted: a.deleted,
    task_uploads_abandoned: b.deleted,
    proofs_deleted: c.deleted,
    proof_uploads_abandoned: d.deleted,
    failed: a.failed + b.failed + c.failed + d.failed,
  };
}
