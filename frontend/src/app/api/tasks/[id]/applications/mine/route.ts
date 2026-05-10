import { handle, notFound } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;

    const app = await queryOne<{ id: string }>(
      `SELECT id FROM task_applications
       WHERE task_id = $1 AND doer_id = $2 AND status = 'pending'`,
      [id, auth.userId],
    );
    if (!app) throw notFound("Application not found");

    await execute(
      `UPDATE task_applications SET status = 'withdrawn' WHERE id = $1`,
      [app.id],
    );
    await logAudit(
      auth.userId,
      "application.withdrawn",
      "task_application",
      app.id,
      null,
      null,
    );
    return ok({ message: "Application withdrawn" });
  });
}
