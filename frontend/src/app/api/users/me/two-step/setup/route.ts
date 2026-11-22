import { handle } from "@/server/errors";
import { requireAuth } from "@/server/auth";
import { ok } from "@/server/route-helpers";
import { startSetup } from "@/server/two-step/service";

export const runtime = "nodejs";

/**
 * Starts setting up two-step sign-in: a new secret, shown once as a QR code
 * and as a key to type. Nothing changes at sign-in until a code from it is
 * confirmed (…/enable).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const setup = await startSetup(auth.userId);
    const res = ok(setup);
    res.headers.set("Cache-Control", "no-store");
    return res;
  });
}
