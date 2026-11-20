import { handle, forbidden, internalError, notFound } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { ok } from "@/server/route-helpers";
import { clientIp } from "@/server/abuse-limits";
import { assertEmailDeliverable } from "@/server/email";
import {
  enforceVerificationEmailLimits,
  issueVerificationEmail,
} from "@/server/email-verification";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const user = await queryOne<{
      id: string;
      email: string;
      email_verified: boolean;
      status: string;
    }>(`SELECT id, email, email_verified, status FROM users WHERE id = $1`, [
      auth.userId,
    ]);
    if (!user) throw notFound("User not found");
    if (user.email_verified) {
      return ok({
        message: "Your email address is already confirmed.",
        already_verified: true,
      });
    }
    if (user.status !== "active") throw forbidden(`Account is ${user.status}`);

    assertEmailDeliverable();
    const ip = clientIp(req);
    await enforceVerificationEmailLimits(user.id, ip);

    try {
      await issueVerificationEmail(user, ip);
    } catch (e) {
      console.error("Verification email failed on resend:", e);
      throw internalError("We could not send the email right now. Try again in a few minutes.");
    }

    return ok({
      message: `We sent a new link to ${user.email}.`,
      already_verified: false,
    });
  });
}
