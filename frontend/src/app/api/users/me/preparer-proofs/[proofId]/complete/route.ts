import { handle, badRequest, conflict, contentRejected, notFound } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok, uuidSchema } from "@/server/route-helpers";
import { requireDocumentsEnabled } from "@/server/documents/storage";
import { verifyUploadedFile } from "@/server/documents/verify-upload";
import { loadProof, PROOF_COLUMNS, proofView, type ProofRow } from "@/server/documents/proofs";

export const runtime = "nodejs";

/** Finishes a proof upload: checks the file, then puts it in the admins' review queue. */
export async function POST(req: Request, { params }: { params: Promise<{ proofId: string }> }) {
  return handle(async () => {
    requireDocumentsEnabled();
    const auth = await requireAuth(req);
    const { proofId } = await params;
    if (!uuidSchema.safeParse(proofId).success) throw badRequest("Not a document ID");
    const proof = await loadProof(proofId);
    if (proof.user_id !== auth.userId) throw notFound("Document not found");
    if (proof.status === "pending") return ok(proofView(proof));
    if (proof.status !== "uploading") throw conflict("This upload has already finished");

    const verified = await verifyUploadedFile(proof);
    if (!verified.ok) {
      if (verified.reason === "missing") throw conflict("The file hasn't arrived yet. Try the upload again");
      await queryOne(
        `UPDATE preparer_proofs SET status = 'abandoned', file_deleted_at = now(), display_name = NULL
         WHERE id = $1 RETURNING id`,
        [proof.id],
      );
      await logAudit(auth.userId, "preparer_proof.file_deleted", "preparer_proof", proof.id, null, {
        reason: "invalid",
      });
      throw contentRejected(verified.message);
    }

    const updated = await queryOne<ProofRow>(
      `UPDATE preparer_proofs SET status = 'pending', size_bytes = $1, uploaded_at = now()
       WHERE id = $2 AND status = 'uploading' RETURNING ${PROOF_COLUMNS}`,
      [verified.size, proof.id],
    );
    if (!updated) throw conflict("This upload changed. Refresh the page");
    await logAudit(auth.userId, "preparer_proof.uploaded", "preparer_proof", proof.id, null, {
      kind: proof.kind,
      content_type: proof.content_type,
      size_bytes: verified.size,
    });
    return ok(proofView(updated));
  });
}
