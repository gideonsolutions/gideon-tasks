import { z } from "zod";
import { handle, notFound } from "@/server/errors";
import { requireAdmin } from "@/server/auth";
import { ok, parseBody, uuidSchema } from "@/server/route-helpers";
import { scheduleClerkBooking } from "@/server/clerk";

export const runtime = "nodejs";

const ScheduleSchema = z.object({
  /** The session's start, as an ISO 8601 timestamp with its offset (stored in UTC). */
  scheduled_for: z.iso.datetime({ offset: true }),
  meeting_details: z.string(),
});

/** Schedules or reschedules a session and emails the time and meeting details to the customer. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw notFound("Booking not found");
    const body = await parseBody(req, ScheduleSchema);
    const { booking, emailSent } = await scheduleClerkBooking({
      adminId: admin.userId,
      bookingId: id,
      scheduledFor: new Date(body.scheduled_for),
      meetingDetails: body.meeting_details,
    });
    return ok({ booking, email_sent: emailSent });
  });
}
