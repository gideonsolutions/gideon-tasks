import { z } from "zod";
import { handle } from "@/server/errors";
import { ok, parseBody } from "@/server/route-helpers";
import { consumeVerificationToken } from "@/server/email-verification";

export const runtime = "nodejs";

const VerifySchema = z.object({ token: z.string().trim().min(1).max(256) });

export async function POST(req: Request) {
  return handle(async () => {
    const { token } = await parseBody(req, VerifySchema);
    const outcome = await consumeVerificationToken(token);
    return ok({
      message:
        outcome === "verified"
          ? "Your email address is confirmed."
          : "Your email address was already confirmed.",
      already_verified: outcome === "already_verified",
    });
  });
}
