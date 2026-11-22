import "server-only";
import { query, queryOne } from "../db";
import { forbidden, notFound } from "../errors";
import { logAudit } from "../audit";
import type { AuthUser } from "../auth";
import { taskDocumentAccess, taskDocumentsDeleteAfter, type DocumentTask } from "./rules";

export interface DocumentTaskRow extends DocumentTask {
  id: string;
  updated_at: string;
}

/** The task, with what the document rules need. */
export async function loadDocumentTask(taskId: string): Promise<DocumentTaskRow> {
  const task = await queryOne<DocumentTaskRow>(
    `SELECT t.id, t.requester_id, t.assigned_doer_id, t.status, t.updated_at,
            c.slug AS category_slug
     FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.id = $1`,
    [taskId],
  );
  if (!task) throw notFound("Task not found");
  return task;
}

export const NO_DOCUMENT_ACCESS =
  "Only the requester and the assigned tasker can see this task's files. Admins can open them only while a dispute is open";

/** Throws 403 unless the user may see the task's files (see taskDocumentAccess). */
export function requireTaskDocumentAccess(
  task: DocumentTaskRow,
  auth: AuthUser,
): "participant" | "admin_dispute" {
  const access = taskDocumentAccess(task, { userId: auth.userId, isAdmin: auth.isAdmin });
  if (!access) throw forbidden(NO_DOCUMENT_ACCESS);
  return access;
}

export interface TaskDocumentRow {
  id: string;
  task_id: string;
  uploader_id: string;
  pathname: string;
  display_name: string;
  content_type: string;
  size_bytes: number | string | null;
  status: "pending" | "uploaded" | "deleted";
  created_at: string;
  uploaded_at: string | null;
}

/** One of the task's files that is still stored (pending or uploaded). */
export async function loadTaskDocument(taskId: string, documentId: string): Promise<TaskDocumentRow> {
  const doc = await queryOne<TaskDocumentRow>(
    `SELECT id, task_id, uploader_id, pathname, display_name, content_type, size_bytes,
            status, created_at, uploaded_at
     FROM task_documents WHERE id = $1 AND task_id = $2 AND status <> 'deleted'`,
    [documentId, taskId],
  );
  if (!doc) throw notFound("File not found");
  return doc;
}

/** What the people on the task see about a file. Never the storage pathname. */
export function documentView(doc: TaskDocumentRow, viewerId: string) {
  return {
    id: doc.id,
    task_id: doc.task_id,
    uploader_id: doc.uploader_id,
    display_name: doc.display_name,
    content_type: doc.content_type,
    size_bytes: doc.size_bytes == null ? null : Number(doc.size_bytes),
    uploaded_at: doc.uploaded_at,
    mine: doc.uploader_id === viewerId,
  };
}

/** The task's uploaded files, for someone who may see them; an admin's look is audited. */
export async function listTaskDocuments(task: DocumentTaskRow, auth: AuthUser) {
  const access = requireTaskDocumentAccess(task, auth);
  const rows = await query<TaskDocumentRow>(
    `SELECT id, task_id, uploader_id, pathname, display_name, content_type, size_bytes,
            status, created_at, uploaded_at
     FROM task_documents WHERE task_id = $1 AND status = 'uploaded'
     ORDER BY uploaded_at ASC`,
    [task.id],
  );
  if (access === "admin_dispute") {
    await logAudit(auth.userId, "task_document.listed_by_admin", "task", task.id, null, {
      access,
      count: rows.length,
    });
  }
  return {
    documents: rows.map((d) => documentView(d, auth.userId)),
    access,
    delete_after: taskDocumentsDeleteAfter(task)?.toISOString() ?? null,
  };
}
