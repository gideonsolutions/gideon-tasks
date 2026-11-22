import { handle, badRequest, notFound } from "@/server/errors";
import { requireAdmin } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { uuidSchema } from "@/server/route-helpers";
import { blobStream, downloadResponse, requireDocumentsEnabled } from "@/server/documents/storage";
import { loadProof, proofFileAvailable } from "@/server/documents/proofs";

export const runtime = "nodejs";

/** An admin opens a proof document to review it. Every opening is audited. */
export async function GET(req: Request, { params }: { params: Promise<{ proofId: string }> }) {
  return handle(async () => {
    requireDocumentsEnabled();
    const admin = await requireAdmin(req);
    const { proofId } = await params;
    if (!uuidSchema.safeParse(proofId).success) throw badRequest("Not a document ID");
    const proof = await loadProof(proofId);
    if (!proofFileAvailable(proof)) throw notFound("This document's file has been deleted");
    await logAudit(admin.userId, "preparer_proof.downloaded", "preparer_proof", proof.id, null, {
      access: "admin",
      user_id: proof.user_id,
    });
    const file = await blobStream(proof.pathname);
    if (!file) throw notFound("This document's file has been deleted");
    return downloadResponse(file, proof.display_name ?? "document");
  });
}
