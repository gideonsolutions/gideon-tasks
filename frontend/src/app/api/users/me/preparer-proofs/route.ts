import { z } from "zod";
import { handle, badRequest, conflict } from "@/server/errors";
import { query, queryOne } from "@/server/db";
import { newId } from "@/server/auth";
import { requireDocumentUser } from "@/server/documents/access";
import { ok, parseBody } from "@/server/route-helpers";
import { issueUploadToken, requireDocumentsEnabled } from "@/server/documents/storage";
import {
  checkFileMeta,
  MAX_OPEN_PROOFS_PER_USER,
  PROOF_KINDS,
  proofPathname,
} from "@/server/documents/rules";
import { PROOF_COLUMNS, proofView, type ProofRow } from "@/server/documents/proofs";

export const runtime = "nodejs";

/** The signed-in tasker's proof documents and their review status. */
export async function GET(req: Request) {
  return handle(async () => {
    requireDocumentsEnabled();
    const auth = await requireDocumentUser(req);
    const rows = await query<ProofRow>(
      `SELECT ${PROOF_COLUMNS} FROM preparer_proofs
       WHERE user_id = $1 AND status NOT IN ('uploading', 'abandoned')
       ORDER BY created_at DESC LIMIT 50`,
      [auth.userId],
    );
    return ok(rows.map(proofView));
  });
}

const StartSchema = z.object({
  kind: z.enum(PROOF_KINDS),
  file_name: z.string().min(1).max(255),
  content_type: z.string(),
  size_bytes: z.number().int(),
});

/**
 * Starts uploading a proof document: records it and issues a token for one
 * upload to a pathname the server chose, valid for 15 minutes.
 */
export async function POST(req: Request) {
  return handle(async () => {
    requireDocumentsEnabled();
    const auth = await requireDocumentUser(req);
    const body = await parseBody(req, StartSchema);
    const check = checkFileMeta(body);
    if (!check.ok) throw badRequest(check.error);

    const proofId = newId();
    const pathname = proofPathname(auth.userId, proofId, check.extension);
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO preparer_proofs
         (id, user_id, kind, pathname, display_name, content_type, status, created_at)
       SELECT $1, $2, $3, $4, $5, $6, 'uploading', now()
       WHERE (SELECT COUNT(*) FROM preparer_proofs
              WHERE user_id = $2 AND status IN ('uploading', 'pending')) < $7
       RETURNING id`,
      [proofId, auth.userId, body.kind, pathname, check.displayName, check.contentType, MAX_OPEN_PROOFS_PER_USER],
    );
    if (!inserted) {
      throw conflict(
        `You can have up to ${MAX_OPEN_PROOFS_PER_USER} documents waiting for review. Wait for a decision, or withdraw one`,
      );
    }
    const { clientToken, validUntil } = await issueUploadToken(pathname, check.contentType);
    return ok(
      {
        proof_id: proofId,
        pathname,
        content_type: check.contentType,
        client_token: clientToken,
        valid_until: new Date(validUntil).toISOString(),
      },
      201,
    );
  });
}
