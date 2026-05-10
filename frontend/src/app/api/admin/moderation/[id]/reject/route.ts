import { z } from "zod";
import { handle, notFound, badRequest } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { logAudit, logModeration } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const RejectSchema = z.object({ reason: z.string().min(1) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    const { id } = await params;
    const body = await parseBody(req, RejectSchema);
    const task = await queryOne<{ status: string }>(
      `SELECT status FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.status !== "pending_review")
      throw badRequest("Task is not pending review");

    await execute(
      `UPDATE tasks SET status = 'rejected', rejection_reason = $1, updated_at = now() WHERE id = $2`,
      [body.reason, id],
    );
    await logModeration("task", id, "rejected", body.reason, admin.userId);
    await logAudit(
      admin.userId,
      "admin.moderation.rejected",
      "task",
      id,
      { status: "pending_review" },
      { status: "rejected", reason: body.reason },
    );
    return ok({ message: "Task rejected" });
  });
}
