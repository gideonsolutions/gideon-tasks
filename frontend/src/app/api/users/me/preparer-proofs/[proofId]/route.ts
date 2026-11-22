import { handle, badRequest, conflict, notFound } from "@/server/errors";
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
import { loadProof, proofFileAvailable } from "@/server/documents/proofs";

export const runtime = "nodejs";

async function ownProof(req: Request, params: Promise<{ proofId: string }>) {
  requireDocumentsEnabled();
  const auth = await requireDocumentUser(req);
  const { proofId } = await params;
  if (!uuidSchema.safeParse(proofId).success) throw badRequest("Not a document ID");
  const proof = await loadProof(proofId);
  // Only the uploader (and admins, through /api/admin/preparer-proofs).
  if (proof.user_id !== auth.userId) throw notFound("Document not found");
  return { auth, proof };
}

/** The tasker downloads their own proof document. Audited. */
export async function GET(req: Request, { params }: { params: Promise<{ proofId: string }> }) {
  return handle(async () => {
    const { auth, proof } = await ownProof(req, params);
    if (!proofFileAvailable(proof)) throw notFound("This document's file has been deleted");
    await logAudit(auth.userId, "preparer_proof.downloaded", "preparer_proof", proof.id, null, {
      access: "uploader",
    });
    const file = await blobStream(proof.pathname);
    if (!file) throw notFound("This document's file has been deleted");
    return downloadResponse(file, proof.display_name ?? "document");
  });
}

/** The tasker withdraws a proof that is still waiting for review; its file is deleted now. */
export async function DELETE(req: Request, { params }: { params: Promise<{ proofId: string }> }) {
  return handle(async () => {
    const { auth, proof } = await ownProof(req, params);
    if (proof.status !== "pending" && proof.status !== "uploading") {
      throw conflict("Only a document waiting for review can be withdrawn");
    }
    await deleteBlob(proof.pathname);
    await queryOne(
      `UPDATE preparer_proofs SET status = 'withdrawn', file_deleted_at = now(), display_name = NULL
       WHERE id = $1 RETURNING id`,
      [proof.id],
    );
    await logAudit(auth.userId, "preparer_proof.withdrawn", "preparer_proof", proof.id, null, {
      kind: proof.kind,
    });
    return ok({ id: proof.id, withdrawn: true });
  });
}
