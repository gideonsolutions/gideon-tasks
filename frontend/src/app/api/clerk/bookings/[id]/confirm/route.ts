import { handle, notFound } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { ok, uuidSchema } from "@/server/route-helpers";
import { confirmClerkHold } from "@/server/clerk";

export const runtime = "nodejs";

/**
 * After 3-D Secure: checks the hold with Stripe and books the session if it
 * is authorized. `requires_action` again means the bank's check is still
 * open; run stripe.handleNextAction with the new secret.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw notFound("Booking not found");
    const outcome = await confirmClerkHold(auth.userId, id);
    if (outcome.status === "requires_action") {
      return ok({
        status: "requires_action",
        booking: outcome.booking,
        payment_client_secret: outcome.clientSecret,
      });
    }
    return ok({ status: "booked", booking: outcome.booking });
  });
}
