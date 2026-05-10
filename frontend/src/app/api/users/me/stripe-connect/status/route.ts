import { handle } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { stripe } from "@/server/stripe";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const row = await queryOne<{ stripe_connect_account_id: string | null }>(
      `SELECT stripe_connect_account_id FROM users WHERE id = $1`,
      [auth.userId],
    );
    if (!row?.stripe_connect_account_id) {
      return ok({ connected: false, charges_enabled: false, payouts_enabled: false });
    }
    const account = await stripe().accounts.retrieve(
      row.stripe_connect_account_id,
    );
    return ok({
      connected: true,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    });
  });
}
