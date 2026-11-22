import { z } from "zod";
import { handle, badRequest, conflict, forbidden } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireAuth, newId } from "@/server/auth";
import { ok, parseBody, uuidSchema } from "@/server/route-helpers";
import { issueUploadToken, requireDocumentsEnabled } from "@/server/documents/storage";
import {
  canUploadTaskDocuments,
  checkFileMeta,
  MAX_DOCUMENTS_PER_TASK,
  taskDocumentPathname,
} from "@/server/documents/rules";
import {
  listTaskDocuments,
  loadDocumentTask,
  requireTaskDocumentAccess,
} from "@/server/documents/task-documents";

export const runtime = "nodejs";

// A Tax Prep or IRS Notices & Representation task's files. Only the
// requester and the assigned tasker can list, upload, download and delete
// them (each their own uploads); an admin can list and open them only while
// a dispute is open (src/server/documents/rules.ts).

async function taskId(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) throw badRequest("Not a task ID");
  return id;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireDocumentsEnabled();
    const auth = await requireAuth(req);
    const task = await loadDocumentTask(await taskId(params));
    const listed = await listTaskDocuments(task, auth);
    return ok({
      ...listed,
      can_upload: canUploadTaskDocuments(task, { userId: auth.userId, isAdmin: auth.isAdmin }),
    });
  });
}

const StartSchema = z.object({
  file_name: z.string().min(1).max(255),
  content_type: z.string(),
  size_bytes: z.number().int(),
});

/**
 * Starts an upload: records the file as pending and issues a token that lets
 * this browser upload exactly one file, to a pathname the server chose, for
 * 15 minutes. The browser then uploads straight to the store and calls
 * .../complete.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireDocumentsEnabled();
    const auth = await requireAuth(req);
    const task = await loadDocumentTask(await taskId(params));
    requireTaskDocumentAccess(task, auth);
    if (!canUploadTaskDocuments(task, { userId: auth.userId, isAdmin: auth.isAdmin })) {
      throw forbidden("Files can be added from when a tasker is assigned until the task is closed");
    }
    const body = await parseBody(req, StartSchema);
    const check = checkFileMeta(body);
    if (!check.ok) throw badRequest(check.error);

    const documentId = newId();
    const pathname = taskDocumentPathname(task.id, documentId, check.extension);
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO task_documents
         (id, task_id, uploader_id, pathname, display_name, content_type, status, created_at)
       SELECT $1, $2, $3, $4, $5, $6, 'pending', now()
       WHERE (SELECT COUNT(*) FROM task_documents
              WHERE task_id = $2 AND status <> 'deleted') < $7
       RETURNING id`,
      [documentId, task.id, auth.userId, pathname, check.displayName, check.contentType, MAX_DOCUMENTS_PER_TASK],
    );
    if (!inserted) {
      throw conflict(`A task can hold up to ${MAX_DOCUMENTS_PER_TASK} files. Delete one to add another`);
    }

    const { clientToken, validUntil } = await issueUploadToken(pathname, check.contentType);
    return ok(
      {
        document_id: documentId,
        pathname,
        content_type: check.contentType,
        client_token: clientToken,
        valid_until: new Date(validUntil).toISOString(),
      },
      201,
    );
  });
}
