import { handle } from "@/server/errors";
import { query } from "@/server/db";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    const rows = await query(
      `SELECT id, name, slug, parent_id, is_active
       FROM categories
       WHERE is_active = true
       ORDER BY sort_order ASC, name ASC`,
    );
    return ok(rows);
  });
}
