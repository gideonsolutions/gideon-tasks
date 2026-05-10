import { handle, notFound, forbidden, badRequest } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;

    const user = await queryOne<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [auth.userId],
    );
    if (!user) throw forbidden("Not an attestor");
    const att = await queryOne<{ id: string }>(
      `SELECT id FROM attestors WHERE contact_email = $1 AND status = 'active'`,
      [user.email],
    );
    if (!att) throw forbidden("Not an attestor");

    const attestation = await queryOne<{ status: string; user_id: string }>(
      `SELECT status, user_id FROM attestations WHERE id = $1 AND attestor_id = $2`,
      [id, att.id],
    );
    if (!attestation) throw notFound("Attestation not found");
    if (attestation.status !== "pending") {
      throw badRequest(`Attestation is already ${attestation.status}`);
    }

    await execute(
      `UPDATE attestations SET status = 'confirmed', confirmed_at = now() WHERE id = $1`,
      [id],
    );
    await logAudit(auth.userId, "attestation.confirmed", "attestation", id, null, {
      user_id: attestation.user_id,
    });
    return ok({ message: "Attestation confirmed" });
  });
}
