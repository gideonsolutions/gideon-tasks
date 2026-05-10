import { handle, notFound, badRequest } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { logAudit, logModeration } from "@/server/audit";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    const { id } = await params;
    const task = await queryOne<{ status: string }>(
      `SELECT status FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.status !== "pending_review")
      throw badRequest("Task is not pending review");

    await execute(
      `UPDATE tasks SET status = 'published', updated_at = now() WHERE id = $1`,
      [id],
    );
    await logModeration("task", id, "approved", "Manual admin approval", admin.userId);
    await logAudit(
      admin.userId,
      "admin.moderation.approved",
      "task",
      id,
      { status: "pending_review" },
      { status: "published" },
    );
    return ok({ message: "Task approved and published" });
  });
}
