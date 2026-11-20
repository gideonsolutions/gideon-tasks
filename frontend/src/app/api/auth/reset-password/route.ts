import { z } from "zod";
import { handle } from "@/server/errors";
import { ok, parseBody } from "@/server/route-helpers";
import { accessTokenLifetimeMinutes, resetPassword } from "@/server/password-reset";

export const runtime = "nodejs";

const ResetSchema = z.object({
  token: z.string().trim().min(1).max(256),
  // Same rules as registration.
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  return handle(async () => {
    const { token, password } = await parseBody(req, ResetSchema);
    await resetPassword(token, password);
    const minutes = accessTokenLifetimeMinutes();
    return ok({
      message: `Your password has been changed. Sign in with your new password. Any other sessions are signed out within ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    });
  });
}
