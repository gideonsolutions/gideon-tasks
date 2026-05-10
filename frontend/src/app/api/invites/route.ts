import { z } from "zod";
import { handle, badRequest, forbidden } from "@/server/errors";
import { execute, query, queryOne } from "@/server/db";
import { requireAuth, newId } from "@/server/auth";
import { ok, parseBody } from "@/server/route-helpers";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

const CreateSchema = z.object({
  target_email: z.string().email().optional().nullable(),
  count: z.number().int().min(1).max(50).optional(),
});

interface AttestorRow {
  id: string;
  invite_quota: number;
}

async function getAttestorForUser(userId: string): Promise<AttestorRow> {
  const user = await queryOne<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`,
    [userId],
  );
  if (!user) throw forbidden("Not an attestor");
  const att = await queryOne<AttestorRow>(
    `SELECT id, invite_quota FROM attestors
     WHERE contact_email = $1 AND status = 'active'`,
    [user.email],
  );
  if (!att) throw forbidden("Not an attestor");
  return att;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  const buf = randomBytes(8);
  return Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const body = await parseBody(req, CreateSchema);
    const attestor = await getAttestorForUser(auth.userId);

    const count = body.count ?? 1;
    const used = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM invites WHERE attestor_id = $1`,
      [attestor.id],
    );
    if ((used?.count ?? 0) + count > attestor.invite_quota) {
      throw badRequest("Invite quota exceeded");
    }

    const expiresAt = new Date(Date.now() + 30 * 86_400_000);
    const out: Array<{ id: string; code: string; expires_at: string }> = [];

    for (let i = 0; i < count; i++) {
      const id = newId();
      const code = generateCode();
      await execute(
        `INSERT INTO invites (id, attestor_id, code, target_email, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [id, attestor.id, code, body.target_email ?? null, expiresAt],
      );
      out.push({ id, code, expires_at: expiresAt.toISOString() });
    }

    return ok(out, 201);
  });
}

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const attestor = await getAttestorForUser(auth.userId);
    const rows = await query(
      `SELECT * FROM invites WHERE attestor_id = $1 ORDER BY created_at DESC`,
      [attestor.id],
    );
    return ok(rows);
  });
}
