import { handle, badRequest, conflict, contentRejected, forbidden } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok, uuidSchema } from "@/server/route-helpers";
import { requireDocumentsEnabled } from "@/server/documents/storage";
import {
  loadDocumentTask,
  loadTaskDocument,
  documentView,
  requireTaskDocumentAccess,
  type TaskDocumentRow,
} from "@/server/documents/task-documents";
import { verifyUploadedFile } from "@/server/documents/verify-upload";

export const runtime = "nodejs";

/**
 * Finishes an upload the uploader started: checks that the file arrived and
 * is what it claims to be (size, type and first bytes), then marks it
 * uploaded and writes the audit entry. A file that fails the check is deleted.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  return handle(async () => {
    requireDocumentsEnabled();
    const auth = await requireAuth(req);
    const { id, documentId } = await params;
    if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(documentId).success) {
      throw badRequest("Not a file ID");
    }
    const task = await loadDocumentTask(id);
    if (requireTaskDocumentAccess(task, auth) !== "participant") {
      throw forbidden("Only the requester and the assigned tasker can add files");
    }
    const doc = await loadTaskDocument(task.id, documentId);
    if (doc.uploader_id !== auth.userId) throw forbidden("Only the uploader can finish this upload");
    if (doc.status === "uploaded") return ok(documentView(doc, auth.userId));

    const verified = await verifyUploadedFile(doc);
    if (!verified.ok) {
      if (verified.reason === "missing") {
        throw conflict("The file hasn't arrived yet. Try the upload again");
      }
      await queryOne(
        `UPDATE task_documents SET status = 'deleted', deleted_at = now(),
           deleted_reason = 'invalid', display_name = NULL
         WHERE id = $1 RETURNING id`,
        [doc.id],
      );
      await logAudit(auth.userId, "task_document.deleted", "task_document", doc.id, null, {
        task_id: task.id,
        reason: "invalid",
      });
      throw contentRejected(verified.message);
    }

    const updated = await queryOne<TaskDocumentRow>(
      `UPDATE task_documents SET status = 'uploaded', size_bytes = $1, uploaded_at = now()
       WHERE id = $2 AND status = 'pending'
       RETURNING id, task_id, uploader_id, pathname, display_name, content_type, size_bytes,
                 status, created_at, uploaded_at`,
      [verified.size, doc.id],
    );
    if (!updated) throw conflict("This upload changed. Refresh the page");
    await logAudit(auth.userId, "task_document.uploaded", "task_document", doc.id, null, {
      task_id: task.id,
      content_type: doc.content_type,
      size_bytes: verified.size,
    });
    return ok(documentView(updated, auth.userId));
  });
}
