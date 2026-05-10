import { handle } from "@/server/errors";
import { execute } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    const { id } = await params;
    await execute(
      `UPDATE users SET status = 'banned', updated_at = now() WHERE id = $1`,
      [id],
    );
    await execute(`DELETE FROM refresh_tokens WHERE user_id = $1`, [id]);
    await logAudit(admin.userId, "admin.user.banned", "user", id, null, {
      status: "banned",
    });
    return ok({ message: "User banned" });
  });
}
