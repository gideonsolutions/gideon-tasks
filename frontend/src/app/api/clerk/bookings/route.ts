import { z } from "zod";
import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { ok, parseBody } from "@/server/route-helpers";
import { createClerkBooking, listCustomerBookings } from "@/server/clerk";
import { CLERK_SESSION_TYPES } from "@/server/clerk-rules";

export const runtime = "nodejs";

/** The signed-in customer's own Gideon Clerk bookings, newest first. */
export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    return ok(await listCustomerBookings(auth.userId));
  });
}

const CreateSchema = z.object({
  hours: z.number().int(),
  session_type: z.enum(CLERK_SESSION_TYPES),
  time_zone: z.string(),
  description: z.string(),
  safety_acknowledged: z
    .boolean()
    .refine((v) => v === true, "Tick the box to confirm you read how Gideon Clerk keeps your logins safe."),
});

/**
 * Books Gideon Clerk and places the hold on the saved card. Responses:
 *  - `{ status: "booked", booking }`: the hold is authorized.
 *  - `{ status: "requires_action", booking, payment_client_secret }`: the
 *    bank wants 3-D Secure. The browser runs stripe.handleNextAction with
 *    the secret and then calls /api/clerk/bookings/[id]/confirm.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const body = await parseBody(req, CreateSchema);
    const outcome = await createClerkBooking({
      userId: auth.userId,
      hours: body.hours,
      sessionType: body.session_type,
      timeZone: body.time_zone,
      description: body.description,
    });
    if (outcome.status === "requires_action") {
      return ok({
        status: "requires_action",
        booking: outcome.booking,
        payment_client_secret: outcome.clientSecret,
      });
    }
    return ok({ status: "booked", booking: outcome.booking }, 201);
  });
}
