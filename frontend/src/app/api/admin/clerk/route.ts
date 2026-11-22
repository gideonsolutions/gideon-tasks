import { handle } from "@/server/errors";
import { requireAdmin } from "@/server/auth";
import { ok } from "@/server/route-helpers";
import { listAdminBookings } from "@/server/clerk";

export const runtime = "nodejs";

/** Gideon Clerk bookings with the customer's contact details: `?scope=all`, or open ones by default. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const scope = new URL(req.url).searchParams.get("scope") === "all" ? "all" : "open";
    return ok(await listAdminBookings(scope));
  });
}
