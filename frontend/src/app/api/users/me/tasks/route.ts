import { handle } from "@/server/errors";
import { query } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const posted = await query(
      `SELECT * FROM tasks WHERE requester_id = $1 ORDER BY updated_at DESC`,
      [auth.userId],
    );
    const doing = await query(
      `SELECT * FROM tasks WHERE assigned_doer_id = $1 ORDER BY updated_at DESC`,
      [auth.userId],
    );
    return ok({ posted, doing });
  });
}
