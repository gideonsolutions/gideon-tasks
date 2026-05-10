import { z } from "zod";
import { handle, badRequest, conflict } from "@/server/errors";
import { execute, query, queryOne } from "@/server/db";
import { hashPassword, newId } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  invite_code: z.string(),
  legal_first_name: z.string().min(1),
  legal_last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  password: z.string().min(8),
});

interface InviteRow {
  id: string;
  attestor_id: string;
  target_email: string | null;
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, RegisterSchema);

    const invite = await queryOne<InviteRow>(
      `SELECT id, attestor_id, target_email FROM invites
       WHERE code = $1 AND claimed_by IS NULL AND expires_at > now()`,
      [body.invite_code],
    );
    if (!invite) throw badRequest("Invalid or expired invite code");

    if (invite.target_email && invite.target_email !== body.email) {
      throw badRequest("This invite was issued for a different email address");
    }

    const emailExists = await query(`SELECT 1 FROM users WHERE email = $1`, [
      body.email,
    ]);
    if (emailExists.length > 0) throw conflict("Email already registered");

    const phoneExists = await query(`SELECT 1 FROM users WHERE phone = $1`, [
      body.phone,
    ]);
    if (phoneExists.length > 0) throw conflict("Phone already registered");

    const passwordHash = await hashPassword(body.password);
    const userId = newId();

    await execute(
      `INSERT INTO users (id, email, phone, legal_first_name, legal_last_name, password_hash, email_verified, phone_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, true, now(), now())`,
      [
        userId,
        body.email,
        body.phone,
        body.legal_first_name,
        body.legal_last_name,
        passwordHash,
      ],
    );

    await execute(`UPDATE invites SET claimed_by = $1 WHERE id = $2`, [
      userId,
      invite.id,
    ]);

    await execute(
      `INSERT INTO attestations (id, attestor_id, user_id, status, created_at)
       VALUES ($1, $2, $3, 'pending', now())`,
      [newId(), invite.attestor_id, userId],
    );

    await execute(
      `INSERT INTO reputation_summary (user_id, updated_at) VALUES ($1, now())`,
      [userId],
    );

    await logAudit(userId, "user.registered", "user", userId, null, {
      email: body.email,
    });

    return ok(
      { user_id: userId, message: "Account created. You can now log in." },
      201,
    );
  });
}
