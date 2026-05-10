import { handle, notFound, forbidden } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { transitionTo, type TaskStatus } from "@/server/state-machine";
import { releasePayment } from "@/server/payments";
import { recomputeReputation } from "@/server/reputation";
import { updateUserTrustLevel } from "@/server/trust";
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
      assigned_doer_id: string | null;
    }>(
      `SELECT requester_id, status, assigned_doer_id FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.requester_id !== auth.userId) throw forbidden("Not your task");
    transitionTo(task.status, "completed");

    await releasePayment(id);
    await execute(
      `UPDATE tasks SET status = 'completed', updated_at = now() WHERE id = $1`,
      [id],
    );
    if (task.assigned_doer_id) {
      await recomputeReputation(task.assigned_doer_id);
      await updateUserTrustLevel(task.assigned_doer_id);
    }
    await logAudit(
      auth.userId,
      "task.completed",
      "task",
      id,
      { status: "submitted" },
      { status: "completed" },
    );
    return ok({ message: "Task completed. Payment released." });
  });
}
