import { z } from "zod";
import { handle, badRequest, conflict } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireDocumentAdmin } from "@/server/documents/access";
import { logAudit } from "@/server/audit";
import { ok, parseBody, uuidSchema } from "@/server/route-helpers";
import { requireDocumentsEnabled } from "@/server/documents/storage";
import { PROOF_COLUMNS, proofView, type ProofRow } from "@/server/documents/proofs";

export const runtime = "nodejs";

const RejectSchema = z.object({
  /** Shown to the tasker: what was wrong and what to send instead. */
  note: z.string().trim().min(1, "Add a note for the tasker").max(500),
});

/** An admin rejects a proof document with a note the tasker sees. The file is kept 90 days, then deleted. */
export async function POST(req: Request, { params }: { params: Promise<{ proofId: string }> }) {
  return handle(async () => {
    requireDocumentsEnabled();
    const admin = await requireDocumentAdmin(req);
    const { proofId } = await params;
    if (!uuidSchema.safeParse(proofId).success) throw badRequest("Not a document ID");
    const body = await parseBody(req, RejectSchema);
    const updated = await queryOne<ProofRow>(
      `UPDATE preparer_proofs SET status = 'rejected', review_note = $1,
         reviewed_by = $2, reviewed_at = now()
       WHERE id = $3 AND status = 'pending' RETURNING ${PROOF_COLUMNS}`,
      [body.note, admin.userId, proofId],
    );
    if (!updated) throw conflict("This document isn't waiting for review");
    await logAudit(
      admin.userId,
      "preparer_proof.rejected",
      "preparer_proof",
      proofId,
      { status: "pending" },
      { status: "rejected", review_note: body.note, user_id: updated.user_id },
    );
    return ok(proofView(updated));
  });
}
