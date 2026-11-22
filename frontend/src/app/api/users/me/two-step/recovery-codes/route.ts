import { z } from "zod";
import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { ok, parseBody } from "@/server/route-helpers";
import { regenerateRecoveryCodes } from "@/server/two-step/service";

export const runtime = "nodejs";

const Schema = z.object({ password: z.string().min(1), code: z.string().trim().min(1).max(40) });

/** Replaces all 10 recovery codes (the password and a code); the new ones are shown only now. */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const body = await parseBody(req, Schema);
    const res = ok({ recovery_codes: await regenerateRecoveryCodes(auth.userId, body.password, body.code) });
    res.headers.set("Cache-Control", "no-store");
    return res;
  });
}
