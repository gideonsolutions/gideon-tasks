import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { requireVerifiedEmail } from "@/server/email-verification";
import { createCardSetupIntent } from "@/server/payments";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

/**
 * Starts saving a card: creates the user's Stripe Customer if needed and a
 * card-only SetupIntent, and returns its client secret for the Payment
 * Element.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    await requireVerifiedEmail(auth.userId, "pay");
    const { clientSecret } = await createCardSetupIntent(auth.userId);
    return ok({ client_secret: clientSecret });
  });
}
