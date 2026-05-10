import { z } from "zod";
import {
  handle,
  notFound,
  forbidden,
  badRequest,
  conflict,
  contentRejected,
  trustLevelInsufficient,
} from "@/server/errors";
import { execute, query, queryOne } from "@/server/db";
import { requireAuth, newId } from "@/server/auth";
import {
  canApplyForTasks,
  maxConcurrentDoer,
  maxTaskValueCents,
} from "@/server/trust-levels";
import { moderateContent } from "@/server/moderation";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const CreateSchema = z.object({ message: z.string().optional().nullable() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const body = await parseBody(req, CreateSchema);

    const task = await queryOne<{
      requester_id: string;
      status: string;
      price_cents: number;
    }>(
      `SELECT requester_id, status, price_cents FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.status !== "published")
      throw badRequest("Can only apply to published tasks");
    if (task.requester_id === auth.userId)
      throw badRequest("Cannot apply to your own task");
    if (!canApplyForTasks(auth.trustLevel))
      throw trustLevelInsufficient("Cannot apply for tasks at this trust level");

    const maxConc = maxConcurrentDoer(auth.trustLevel);
    const active = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM tasks
       WHERE assigned_doer_id = $1 AND status IN ('assigned','in_progress','submitted')`,
      [auth.userId],
    );
    if ((active?.count ?? 0) >= maxConc) {
      throw badRequest(`Maximum concurrent doer tasks reached (${maxConc})`);
    }

    const maxVal = maxTaskValueCents(auth.trustLevel);
    if (task.price_cents > maxVal) {
      throw trustLevelInsufficient(
        `Task value exceeds your trust level maximum ($${(maxVal / 100).toFixed(2)})`,
      );
    }

    const dup = await query(
      `SELECT 1 FROM task_applications WHERE task_id = $1 AND doer_id = $2`,
      [id, auth.userId],
    );
    if (dup.length > 0) throw conflict("Already applied to this task");

    if (body.message) {
      const m = moderateContent(body.message);
      if (m.kind === "rejected") throw contentRejected(m.reason);
    }

    const appId = newId();
    await execute(
      `INSERT INTO task_applications (id, task_id, doer_id, message, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', now())`,
      [appId, id, auth.userId, body.message ?? null],
    );
    await logAudit(
      auth.userId,
      "application.created",
      "task_application",
      appId,
      null,
      { task_id: id },
    );
    return ok({ id: appId, message: "Application submitted" }, 201);
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const task = await queryOne<{ requester_id: string }>(
      `SELECT requester_id FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.requester_id !== auth.userId) throw forbidden("Not your task");

    const rows = await query(
      `SELECT * FROM task_applications WHERE task_id = $1 ORDER BY created_at ASC`,
      [id],
    );
    return ok(rows);
  });
}
