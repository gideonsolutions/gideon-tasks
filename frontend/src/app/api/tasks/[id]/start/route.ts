import { handle, notFound, forbidden } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { transitionTo, type TaskStatus } from "@/server/state-machine";
import { capturePayment } from "@/server/payments";
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
      assigned_doer_id: string | null;
      status: TaskStatus;
    }>(`SELECT assigned_doer_id, status FROM tasks WHERE id = $1`, [id]);
    if (!task) throw notFound("Task not found");
    if (task.assigned_doer_id !== auth.userId)
      throw forbidden("Not the assigned doer");
    transitionTo(task.status, "in_progress");

    await capturePayment(id);
    await execute(
      `UPDATE tasks SET status = 'in_progress', updated_at = now() WHERE id = $1`,
      [id],
    );
    await logAudit(
      auth.userId,
      "task.started",
      "task",
      id,
      { status: "assigned" },
      { status: "in_progress" },
    );
    return ok({ message: "Task started" });
  });
}
