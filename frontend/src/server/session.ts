import "server-only";
import { execute } from "./db";
import { createAccessToken, generateRefreshToken, hashRefreshToken, newId } from "./auth";
import { env } from "./env";

/**
 * Issues an access token and a refresh token. `mfa` says the session passed
 * two-step sign-in: it goes in the access token and on the refresh token's
 * row, so a refresh keeps it but can never add it.
 */
export async function issueSession(
  user: { id: string; is_admin: boolean; trust_level: number },
  mfa: boolean,
): Promise<{ access_token: string; refresh_token: string }> {
  const accessToken = await createAccessToken(user.id, user.is_admin, user.trust_level, mfa);
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.jwtRefreshExpirySecs * 1000);
  await execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, mfa_verified, created_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [newId(), user.id, hashRefreshToken(refreshToken), expiresAt, mfa],
  );
  return { access_token: accessToken, refresh_token: refreshToken };
}

/** Signs the user out everywhere: every refresh token goes. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await execute(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
}
