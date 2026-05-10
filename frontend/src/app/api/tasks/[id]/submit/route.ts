import { z } from "zod";
import { handle, notFound, forbidden } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { transitionTo, type TaskStatus } from "@/server/state-machine";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const SubmitSchema = z.object({
  completion_notes: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const body = await parseBody(req, SubmitSchema).catch(() => ({}));

    const task = await queryOne<{
      assigned_doer_id: string | null;
      status: TaskStatus;
    }>(`SELECT assigned_doer_id, status FROM tasks WHERE id = $1`, [id]);
    if (!task) throw notFound("Task not found");
    if (task.assigned_doer_id !== auth.userId)
      throw forbidden("Not the assigned doer");
    transitionTo(task.status, "submitted");

    await execute(
      `UPDATE tasks SET status = 'submitted', updated_at = now() WHERE id = $1`,
      [id],
    );
    await logAudit(
      auth.userId,
      "task.submitted",
      "task",
      id,
      { status: "in_progress" },
      {
        status: "submitted",
        notes: (body as { completion_notes?: string }).completion_notes,
      },
    );
    return ok({ message: "Task submitted for review" });
  });
}
