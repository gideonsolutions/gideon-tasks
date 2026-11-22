import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { ok } from "@/server/route-helpers";
import { twoStepStatus } from "@/server/two-step/service";

export const runtime = "nodejs";

/** Whether the signed-in user has two-step sign-in on, and whether this deployment offers it. */
export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    return ok({ ...(await twoStepStatus(auth.userId)), session_verified: auth.mfa === true });
  });
}
