import { handle, badRequest, forbidden, notFound } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireDocumentUser } from "@/server/documents/access";
import { logAudit } from "@/server/audit";
import { ok, uuidSchema } from "@/server/route-helpers";
import {
  blobStream,
  deleteBlob,
  downloadResponse,
  requireDocumentsEnabled,
} from "@/server/documents/storage";
import {
  loadDocumentTask,
  loadTaskDocument,
  requireTaskDocumentAccess,
} from "@/server/documents/task-documents";

export const runtime = "nodejs";

async function ids(params: Promise<{ id: string; documentId: string }>) {
  const { id, documentId } = await params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(documentId).success) {
    throw badRequest("Not a file ID");
  }
  return { id, documentId };
}

/**
 * Downloads a file, for the requester or the assigned tasker, or an admin
 * while a dispute is open. Every download is written to the audit log first.
 * The file is streamed from the private store; no URL to it is ever sent.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  return handle(async () => {
    requireDocumentsEnabled();
    const auth = await requireDocumentUser(req);
    const { id, documentId } = await ids(params);
    const task = await loadDocumentTask(id);
    const access = requireTaskDocumentAccess(task, auth);
    const doc = await loadTaskDocument(task.id, documentId);
    if (doc.status !== "uploaded") throw notFound("File not found");

    await logAudit(auth.userId, "task_document.downloaded", "task_document", doc.id, null, {
      task_id: task.id,
      access,
    });
    const file = await blobStream(doc.pathname);
    if (!file) throw notFound("File not found");
    return downloadResponse(file, doc.display_name ?? "document");
  });
}

/** Deletes a file: only its uploader, while they are on the task. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  return handle(async () => {
    requireDocumentsEnabled();
    const auth = await requireDocumentUser(req);
    const { id, documentId } = await ids(params);
    const task = await loadDocumentTask(id);
    if (requireTaskDocumentAccess(task, auth) !== "participant") {
      throw forbidden("Only the person who uploaded a file can delete it");
    }
    const doc = await loadTaskDocument(task.id, documentId);
    if (doc.uploader_id !== auth.userId) {
      throw forbidden("Only the person who uploaded a file can delete it");
    }

    await deleteBlob(doc.pathname);
    await queryOne(
      `UPDATE task_documents SET status = 'deleted', deleted_at = now(),
         deleted_reason = 'uploader', display_name = NULL
       WHERE id = $1 RETURNING id`,
      [doc.id],
    );
    await logAudit(auth.userId, "task_document.deleted", "task_document", doc.id, null, {
      task_id: task.id,
      reason: "uploader",
    });
    return ok({ id: doc.id, deleted: true });
  });
}
