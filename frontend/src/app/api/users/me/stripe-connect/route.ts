import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { requireVerifiedEmail } from "@/server/email-verification";
import { createPayoutOnboardingLink } from "@/server/payments";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

/**
 * Starts or resumes payout onboarding. Returns a single-use Stripe link;
 * Stripe sends the doer back to /profile/stripe/return when they finish or
 * leave, and to /profile/stripe/refresh if the link has expired.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    await requireVerifiedEmail(auth.userId, "payouts");
    return ok(await createPayoutOnboardingLink(auth.userId));
  });
}
