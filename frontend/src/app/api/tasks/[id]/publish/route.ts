import {
  handle,
  notFound,
  forbidden,
  contentRejected,
  contentFlagged,
} from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { transitionTo, type TaskStatus } from "@/server/state-machine";
import { moderateContent } from "@/server/moderation";
import { logAudit, logModeration } from "@/server/audit";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

interface TaskRow {
  id: string;
  requester_id: string;
  status: TaskStatus;
  title: string;
  description: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const task = await queryOne<TaskRow>(
      `SELECT id, requester_id, status, title, description FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.requester_id !== auth.userId) throw forbidden("Not your task");

    transitionTo(task.status, "pending_review");

    const moderation = moderateContent(`${task.title} ${task.description}`);

    if (moderation.kind === "clean") {
      await execute(
        `UPDATE tasks SET status = 'published', updated_at = now() WHERE id = $1`,
        [id],
      );
      await logModeration("task", id, "approved", "Automated: content clean", null);
      await logAudit(
        auth.userId,
        "task.published",
        "task",
        id,
        { status: "draft" },
        { status: "published" },
      );
      const updated = await queryOne(`SELECT * FROM tasks WHERE id = $1`, [id]);
      return ok({ task: updated, moderation: "approved" });
    }

    if (moderation.kind === "rejected") {
      await execute(
        `UPDATE tasks SET status = 'rejected', rejection_reason = $1, updated_at = now() WHERE id = $2`,
        [moderation.reason, id],
      );
      await logModeration("task", id, "rejected", moderation.reason, null);
      throw contentRejected(moderation.reason);
    }

    await execute(
      `UPDATE tasks SET status = 'pending_review', moderation_note = $1, updated_at = now() WHERE id = $2`,
      [moderation.reason, id],
    );
    await logModeration("task", id, "flagged", moderation.reason, null);
    throw contentFlagged(moderation.reason);
  });
}
