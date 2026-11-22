import { z } from "zod";
import { handle, unauthorized, forbidden } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { hashRefreshToken } from "@/server/auth";
import { issueSession } from "@/server/session";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const RefreshSchema = z.object({ refresh_token: z.string() });

/**
 * Swaps a refresh token for a new pair. The new session keeps whether the
 * old one passed two-step sign-in, and can never gain it: if the account has
 * two-step sign-in on and this refresh token predates it (or skipped it), it
 * is refused and the user signs in again with a code.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, RefreshSchema);
    const tokenHash = hashRefreshToken(body.refresh_token);

    const row = await queryOne<{ id: string; user_id: string; mfa_verified: boolean }>(
      `SELECT id, user_id, mfa_verified FROM refresh_tokens
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
      totp_enabled_at: string | null;
    }>(
      `SELECT id, is_admin, trust_level, status, totp_enabled_at FROM users WHERE id = $1`,
      [row.user_id],
    );
    if (!user) throw unauthorized("User not found");
    if (user.status !== "active")
      throw forbidden(`Account is ${user.status}`);
    if (user.totp_enabled_at && !row.mfa_verified) {
      throw unauthorized("Sign in again with your two-step code");
    }

    return ok(await issueSession(user, row.mfa_verified && !!user.totp_enabled_at));
  });
}
