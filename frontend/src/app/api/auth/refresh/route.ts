import { z } from "zod";
import { handle, unauthorized, forbidden } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import {
  createAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  newId,
} from "@/server/auth";
import { env } from "@/server/env";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const RefreshSchema = z.object({ refresh_token: z.string() });

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, RefreshSchema);
    const tokenHash = hashRefreshToken(body.refresh_token);

    const row = await queryOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM refresh_tokens
       WHERE token_hash = $1 AND expires_at > now()`,
      [tokenHash],
    );
    if (!row) throw unauthorized("Invalid or expired refresh token");

    await execute(`DELETE FROM refresh_tokens WHERE id = $1`, [row.id]);

    const user = await queryOne<{
      id: string;
      is_admin: boolean;
      trust_level: number;
      status: string;
    }>(
      `SELECT id, is_admin, trust_level, status FROM users WHERE id = $1`,
      [row.user_id],
    );
    if (!user) throw unauthorized("User not found");
    if (user.status !== "active")
      throw forbidden(`Account is ${user.status}`);

    const accessToken = await createAccessToken(
      user.id,
      user.is_admin,
      user.trust_level,
    );
    const newRefresh = generateRefreshToken();
    const newHash = hashRefreshToken(newRefresh);
    const expiresAt = new Date(Date.now() + env.jwtRefreshExpirySecs * 1000);

    await execute(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [newId(), user.id, newHash, expiresAt],
    );

    return ok({ access_token: accessToken, refresh_token: newRefresh });
  });
}
