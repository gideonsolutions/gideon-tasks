import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { getPayoutStatus } from "@/server/payments";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

/**
 * Live payout status, read from Stripe on every call. The return page calls
 * it after onboarding, because reaching return_url does not mean onboarding
 * is complete.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    return ok(await getPayoutStatus(auth.userId));
  });
}
