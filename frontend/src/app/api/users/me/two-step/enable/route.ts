import { z } from "zod";
import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { ok, parseBody } from "@/server/route-helpers";
import { issueSession, revokeAllSessions } from "@/server/session";
import { enable } from "@/server/two-step/service";
import { sessionUser } from "@/server/two-step/session-user";

export const runtime = "nodejs";

const Schema = z.object({ password: z.string().min(1), code: z.string().trim().min(1).max(20) });

/**
 * Turns two-step sign-in on with the password and a code from the new
 * secret. Returns the 10 recovery codes (shown only now) and a new session
 * that has passed two-step sign-in; every other session is signed out.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const body = await parseBody(req, Schema);
    const recoveryCodes = await enable(auth.userId, body.password, body.code);
    await revokeAllSessions(auth.userId);
    const session = await issueSession(await sessionUser(auth.userId), true);
    const res = ok({ recovery_codes: recoveryCodes, ...session });
    res.headers.set("Cache-Control", "no-store");
    return res;
  });
}
