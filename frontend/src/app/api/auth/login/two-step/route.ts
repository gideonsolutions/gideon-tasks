import { z } from "zod";
import { handle, unauthorized, forbidden } from "@/server/errors";
import { queryOne } from "@/server/db";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";
import { issueSession } from "@/server/session";
import { userSelfView } from "@/server/user-self-view";
import { readPendingLogin } from "@/server/two-step/pending-login";
import { checkSecondFactor } from "@/server/two-step/service";

export const runtime = "nodejs";

const Schema = z.object({
  pending_token: z.string().min(1),
  code: z.string().trim().min(1).max(40),
});

/**
 * The second step of signing in: the pending-login token from the password
 * step and a code from the authenticator app, or a recovery code. Only now
 * are an access token and a refresh token issued, both marked as having
 * passed two-step sign-in. Wrong codes count toward an escalating lockout.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, Schema);
    const userId = await readPendingLogin(body.pending_token, async (id) => {
      const u = await queryOne<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [id]);
      return u?.password_hash ?? null;
    });
    if (!userId) throw unauthorized("Your sign-in expired. Enter your email and password again");

    const user = await queryOne<Record<string, unknown> & {
      id: string;
      status: string;
      is_admin: boolean;
      trust_level: number;
      totp_enabled_at: string | null;
    }>(`SELECT * FROM users WHERE id = $1`, [userId]);
    if (!user) throw unauthorized("Your sign-in expired. Enter your email and password again");
    if (user.status !== "active") throw forbidden(`Account is ${user.status}`);

    // Turned off by an admin since the password step: the password is enough.
    if (!user.totp_enabled_at) {
      const session = await issueSession(user, false);
      await logAudit(user.id, "user.login", "user", user.id, null, { second_factor: "none" });
      return ok({ ...session, user: userSelfView(user) });
    }

    const result = await checkSecondFactor(user.id, body.code);
    const session = await issueSession(user, true);
    await logAudit(user.id, "user.login", "user", user.id, null, { second_factor: result.method });
    return ok({
      ...session,
      user: userSelfView(user),
      ...(result.method === "recovery" && { recovery_codes_left: result.recovery_codes_left }),
    });
  });
}
