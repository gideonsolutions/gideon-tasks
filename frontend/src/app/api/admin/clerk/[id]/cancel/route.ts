import { z } from "zod";
import { handle, notFound } from "@/server/errors";
import { requireAdmin } from "@/server/auth";
import { ok, parseBody, uuidSchema } from "@/server/route-helpers";
import { cancelClerkBooking, getAdminBooking } from "@/server/clerk";

export const runtime = "nodejs";

const CancelSchema = z.object({ reason: z.string() });

/** Cancels an open booking and releases the hold. The reason is shown to the customer. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw notFound("Booking not found");
    const { reason } = await parseBody(req, CancelSchema);
    await cancelClerkBooking({ actorId: admin.userId, bookingId: id, asAdmin: true, reason });
    return ok({ booking: await getAdminBooking(id) });
  });
}
