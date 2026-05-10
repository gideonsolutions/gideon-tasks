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
      `UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1`,
      [id],
    );
    await logAudit(admin.userId, "admin.user.suspended", "user", id, null, {
      status: "suspended",
    });
    return ok({ message: "User suspended" });
  });
}
