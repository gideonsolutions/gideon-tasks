import { after } from "next/server";
import { z } from "zod";
import { handle } from "@/server/errors";
import { ok, parseBody } from "@/server/route-helpers";
import { clientIp } from "@/server/abuse-limits";
import { assertEmailDeliverable } from "@/server/email";
import {
  FORGOT_PASSWORD_MESSAGE,
  enforcePasswordResetRequestLimit,
  recordPasswordResetRequest,
  sendPasswordResetIfAccountExists,
} from "@/server/password-reset";

export const runtime = "nodejs";

const ForgotSchema = z.object({ email: z.string().trim().email().max(254) });

/**
 * Answers every well-formed request identically. Everything that depends on
 * whether the address has an account (the lookup, the per-account limits,
 * the token and the email) runs after the response is sent.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { email } = await parseBody(req, ForgotSchema);
    const ip = clientIp(req);

    assertEmailDeliverable();
    await enforcePasswordResetRequestLimit(ip);
    await recordPasswordResetRequest(ip);

    after(async () => {
      try {
        await sendPasswordResetIfAccountExists(email, ip);
      } catch (e) {
        console.error("Password reset email failed:", e);
      }
    });

    return ok({ message: FORGOT_PASSWORD_MESSAGE });
  });
}
