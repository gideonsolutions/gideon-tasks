import { handle, notFound, forbidden } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { transitionTo, type TaskStatus } from "@/server/state-machine";
import { logAudit } from "@/server/audit";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const task = await queryOne<{
      requester_id: string;
      status: TaskStatus;
    }>(`SELECT requester_id, status FROM tasks WHERE id = $1`, [id]);
    if (!task) throw notFound("Task not found");
    if (task.requester_id !== auth.userId) throw forbidden("Not your task");
    transitionTo(task.status, "disputed");

    await execute(
      `UPDATE tasks SET status = 'disputed', updated_at = now() WHERE id = $1`,
      [id],
    );
    await logAudit(
      auth.userId,
      "task.disputed",
      "task",
      id,
      { status: "submitted" },
      { status: "disputed" },
    );
    return ok({ message: "Task disputed. Awaiting admin resolution." });
  });
}
