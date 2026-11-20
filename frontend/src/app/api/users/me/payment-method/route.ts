import { z } from "zod";
import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { requireVerifiedEmail } from "@/server/email-verification";
import { getSavedCard, saveCardFromSetupIntent } from "@/server/payments";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

/** The card used for bookings (brand, last 4, expiry), or null. */
export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    return ok({ card: await getSavedCard(auth.userId) });
  });
}

const SaveSchema = z.object({
  setup_intent_id: z.string().regex(/^seti_[A-Za-z0-9]+$/, "Invalid SetupIntent ID"),
});

/**
 * Called after stripe.confirmSetup succeeds in the browser (or on the
 * return page after a redirect): records that SetupIntent's card as the one
 * to use for bookings.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { setup_intent_id } = await parseBody(req, SaveSchema);
    await requireVerifiedEmail(auth.userId, "pay");
    const card = await saveCardFromSetupIntent(auth.userId, setup_intent_id);
    return ok({ card, message: "Card saved." });
  });
}
