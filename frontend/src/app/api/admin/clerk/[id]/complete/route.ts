import { z } from "zod";
import { handle, notFound } from "@/server/errors";
import { requireAdmin } from "@/server/auth";
import { ok, parseBody, uuidSchema } from "@/server/route-helpers";
import { completeClerkBooking } from "@/server/clerk";

export const runtime = "nodejs";

const CompleteSchema = z.object({ hours_used: z.number().int() });

/** Records the whole hours used and captures only those; the rest of the hold is released. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw notFound("Booking not found");
    const { hours_used } = await parseBody(req, CompleteSchema);
    const booking = await completeClerkBooking({ adminId: admin.userId, bookingId: id, hoursUsed: hours_used });
    return ok({ booking });
  });
}
