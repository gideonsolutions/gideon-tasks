import { handle } from "@/server/errors";
import { query } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const flagged = await query(
      `SELECT * FROM moderation_log WHERE action = 'flagged' ORDER BY created_at DESC LIMIT 100`,
    );
    const pending = await query(
      `SELECT * FROM tasks WHERE status = 'pending_review' ORDER BY created_at ASC`,
    );
    return ok({ flagged_entries: flagged, pending_tasks: pending });
  });
}
