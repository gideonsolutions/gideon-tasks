import "server-only";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";

// After the right password, an account with two-step sign-in gets only a
// pending-login token: a 5-minute JWT that says which account's password
// was right, for the code step. It is not a session and grants nothing
// else. It is signed with a key derived from JWT_SECRET for this purpose
// alone, so it can never pass as an access token (and requireAuth refuses
// any token with a `purpose`), and it is bound to the password hash, so a
// password change voids it.

export const PENDING_LOGIN_TTL_SECS = 5 * 60;
const PURPOSE = "two_step_login";

const key = () =>
  createHash("sha256").update(`gideon-tasks two-step pending login\0${env.jwtSecret}`).digest();

const bind = (passwordHash: string) =>
  createHash("sha256").update(`pending\0${passwordHash}`).digest("base64url").slice(0, 22);

export async function issuePendingLogin(userId: string, passwordHash: string, now = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ purpose: PURPOSE, pwb: bind(passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + PENDING_LOGIN_TTL_SECS)
    .sign(key());
}

/** The account a pending-login token is for, if it is genuine, current and its password unchanged. */
export async function readPendingLogin(
  token: string,
  passwordHashFor: (userId: string) => Promise<string | null>,
  now = new Date(),
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { currentDate: now });
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string") return null;
    const hash = await passwordHashFor(payload.sub);
    if (!hash || payload.pwb !== bind(hash)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
