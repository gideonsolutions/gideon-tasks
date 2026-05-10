import { handle, notFound, forbidden } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { transitionTo, type TaskStatus } from "@/server/state-machine";
import { refundPayment } from "@/server/payments";
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

    transitionTo(task.status, "cancelled");

    await execute(
      `UPDATE tasks SET status = 'cancelled', updated_at = now() WHERE id = $1`,
      [id],
    );

    const hasPayment = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM payments WHERE task_id = $1) AS exists`,
      [id],
    );
    if (hasPayment?.exists) {
      await refundPayment(id);
    }

    await logAudit(
      auth.userId,
      "task.cancelled",
      "task",
      id,
      { status: task.status },
      { status: "cancelled" },
    );

    return ok({ message: "Task cancelled" });
  });
}
