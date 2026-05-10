import { z } from "zod";
import { handle, notFound, badRequest } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { releasePayment, refundPayment } from "@/server/payments";
import { recomputeReputation } from "@/server/reputation";
import { updateUserTrustLevel } from "@/server/trust";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const ResolveSchema = z.object({
  resolution: z.enum(["release", "refund"]),
  notes: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    const { id } = await params;
    const body = await parseBody(req, ResolveSchema);

    const task = await queryOne<{
      status: string;
      assigned_doer_id: string | null;
    }>(`SELECT status, assigned_doer_id FROM tasks WHERE id = $1`, [id]);
    if (!task) throw notFound("Task not found");
    if (task.status !== "disputed") throw badRequest("Task is not disputed");

    if (body.resolution === "release") {
      await releasePayment(id);
    } else {
      await refundPayment(id);
      if (task.assigned_doer_id) {
        await recomputeReputation(task.assigned_doer_id);
        await updateUserTrustLevel(task.assigned_doer_id);

        const lostCount = await queryOne<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM tasks t
           JOIN payments p ON p.task_id = t.id
           WHERE t.assigned_doer_id = $1
             AND t.status = 'resolved'
             AND p.status = 'refunded'
             AND t.updated_at > now() - interval '30 days'`,
          [task.assigned_doer_id],
        );
        if ((lostCount?.count ?? 0) >= 3) {
          await execute(
            `UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1`,
            [task.assigned_doer_id],
          );
          await logAudit(
            null,
            "user.auto_suspended",
            "user",
            task.assigned_doer_id,
            null,
            { reason: "3+ disputes lost in 30 days" },
          );
        }
      }
    }

    await execute(
      `UPDATE tasks SET status = 'resolved', updated_at = now() WHERE id = $1`,
      [id],
    );
    await logAudit(
      admin.userId,
      "admin.dispute.resolved",
      "task",
      id,
      { status: "disputed" },
      { status: "resolved", resolution: body.resolution, notes: body.notes },
    );
    return ok({ message: `Dispute resolved: ${body.resolution}` });
  });
}
