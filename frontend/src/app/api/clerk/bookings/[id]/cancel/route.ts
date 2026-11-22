import { handle, notFound } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { ok, uuidSchema } from "@/server/route-helpers";
import { cancelClerkBooking } from "@/server/clerk";

export const runtime = "nodejs";

/** The customer cancels their own booking before the session starts; the hold is released. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw notFound("Booking not found");
    const booking = await cancelClerkBooking({ actorId: auth.userId, bookingId: id, asAdmin: false });
    return ok({ booking, message: "Booking cancelled. The hold on your card is released." });
  });
}
