import { handle } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { stripe } from "@/server/stripe";
import { env } from "@/server/env";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);

    let connectId: string | null = null;
    const existing = await queryOne<{ stripe_connect_account_id: string | null }>(
      `SELECT stripe_connect_account_id FROM users WHERE id = $1`,
      [auth.userId],
    );
    connectId = existing?.stripe_connect_account_id ?? null;

    const s = stripe();
    if (!connectId) {
      const account = await s.accounts.create({
        type: "express",
        country: "US",
        capabilities: { transfers: { requested: true } },
      });
      connectId = account.id;
      await execute(
        `UPDATE users SET stripe_connect_account_id = $1, updated_at = now() WHERE id = $2`,
        [connectId, auth.userId],
      );
    }

    const link = await s.accountLinks.create({
      account: connectId,
      type: "account_onboarding",
      return_url: `${env.baseUrl}/stripe/return`,
      refresh_url: `${env.baseUrl}/stripe/refresh`,
    });

    return ok({ url: link.url });
  });
}
