import { handle, forbidden } from "@/server/errors";
import { query, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

async function getAttestorId(userId: string): Promise<string> {
  // Attestors are matched by email, so only a confirmed address counts.
  const user = await queryOne<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND email_verified = true`,
    [userId],
  );
  if (!user) throw forbidden("Not an attestor");
  const att = await queryOne<{ id: string }>(
    `SELECT id FROM attestors WHERE contact_email = $1 AND status = 'active'`,
    [user.email],
  );
  if (!att) throw forbidden("Not an attestor");
  return att.id;
}

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const attestorId = await getAttestorId(auth.userId);
    const rows = await query(
      `SELECT * FROM attestations WHERE attestor_id = $1 ORDER BY created_at DESC`,
      [attestorId],
    );
    return ok(rows);
  });
}
