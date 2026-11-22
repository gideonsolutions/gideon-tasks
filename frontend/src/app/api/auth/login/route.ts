import { z } from "zod";
import { handle, unauthorized, forbidden } from "@/server/errors";
import { queryOne } from "@/server/db";
import { verifyPassword } from "@/server/auth";
import { issueSession } from "@/server/session";
import { issuePendingLogin, PENDING_LOGIN_TTL_SECS } from "@/server/two-step/pending-login";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";
import { userSelfView } from "@/server/user-self-view";

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
  background_check_cleared_at: string | null;
  /** For admins only: never sent to the user. */
  background_check_note: string | null;
  /** For admins only: the user gets has_ptin instead (see userSelfView). */
  ptin: string | null;
  ptin_year: number | null;
  tax_credential: string | null;
  /** When two-step sign-in was turned on; null if it is off. */
  totp_enabled_at: string | null;
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

    // With two-step sign-in on, the password earns only a 5-minute
    // pending-login token for the code step (/api/auth/login/two-step):
    // no access or refresh token until a code is right.
    if (user.totp_enabled_at) {
      await logAudit(user.id, "user.login.two_step_required", "user", user.id, null, null);
      return ok({
        two_step_required: true,
        pending_token: await issuePendingLogin(user.id, user.password_hash),
        expires_in: PENDING_LOGIN_TTL_SECS,
      });
    }

    const session = await issueSession(user, false);
    await logAudit(user.id, "user.login", "user", user.id, null, null);

    return ok({
      ...session,
      // Without the password hash and the columns only admins see.
      user: userSelfView({ ...user }),
    });
  });
}
