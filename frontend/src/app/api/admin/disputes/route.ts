import { handle } from "@/server/errors";
import { query } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const rows = await query(
      `SELECT * FROM tasks WHERE status = 'disputed' ORDER BY updated_at ASC`,
    );
    return ok(rows);
  });
}
