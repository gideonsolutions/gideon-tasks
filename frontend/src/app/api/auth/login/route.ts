import { z } from "zod";
import { handle, unauthorized, forbidden } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import {
  createAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  newId,
  verifyPassword,
} from "@/server/auth";
import { logAudit } from "@/server/audit";
import { env } from "@/server/env";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

interface UserRow {
  id: string;
  email: string;
  phone: string;
  legal_first_name: string;
  legal_last_name: string;
  password_hash: string;
  trust_level: number;
  status: string;
  email_verified: boolean;
  phone_verified: boolean;
  stripe_customer_id: string | null;
  stripe_connect_account_id: string | null;
  id_verified_at: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, LoginSchema);

    const user = await queryOne<UserRow>(
      `SELECT * FROM users WHERE email = $1`,
      [body.email],
    );
    if (!user) throw unauthorized("Invalid email or password");
    if (user.status !== "active")
      throw forbidden(`Account is ${user.status}`);

    if (!(await verifyPassword(body.password, user.password_hash))) {
      throw unauthorized("Invalid email or password");
    }

    const accessToken = await createAccessToken(
      user.id,
      user.is_admin,
      user.trust_level,
    );
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + env.jwtRefreshExpirySecs * 1000);

    await execute(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [newId(), user.id, tokenHash, expiresAt],
    );

    await logAudit(user.id, "user.login", "user", user.id, null, null);

    const { password_hash: _omit, ...publicUser } = user;
    void _omit;
    return ok({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: publicUser,
    });
  });
}
