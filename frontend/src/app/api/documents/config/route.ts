import { handle } from "@/server/errors";
import { ok } from "@/server/route-helpers";
import { documentsEnabled } from "@/server/documents/storage";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_TASK,
  PROOF_RETENTION_DAYS,
  TASK_DOCUMENT_RETENTION_DAYS,
} from "@/server/documents/rules";

export const runtime = "nodejs";

/** Whether document storage is set up, and its limits, so the pages can hide it when it isn't. */
export async function GET() {
  return handle(async () =>
    ok({
      enabled: documentsEnabled(),
      content_types: DOCUMENT_CONTENT_TYPES,
      accept: DOCUMENT_ACCEPT,
      max_file_bytes: MAX_DOCUMENT_BYTES,
      max_files_per_task: MAX_DOCUMENTS_PER_TASK,
      task_retention_days: TASK_DOCUMENT_RETENTION_DAYS,
      proof_retention_days: PROOF_RETENTION_DAYS,
    }),
  );
}
