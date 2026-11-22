import { z } from "zod";
import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { ok, parseBody } from "@/server/route-helpers";
import { issueSession, revokeAllSessions } from "@/server/session";
import { disable } from "@/server/two-step/service";
import { sessionUser } from "@/server/two-step/session-user";

export const runtime = "nodejs";

const Schema = z.object({ password: z.string().min(1), code: z.string().trim().min(1).max(40) });

/**
 * Turns two-step sign-in off with the password and a current code (or a
 * recovery code). Every session is signed out; this one gets a new session
 * without two-step sign-in. An account that must have it (an admin, or
 * someone who shares documents) loses access to those until it is back on.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const body = await parseBody(req, Schema);
    await disable(auth.userId, body.password, body.code);
    await revokeAllSessions(auth.userId);
    return ok(await issueSession(await sessionUser(auth.userId), false));
  });
}
