import { z } from "zod";
import {
  handle,
  notFound,
  forbidden,
  badRequest,
  contentRejected,
} from "@/server/errors";
import { execute, query, queryOne } from "@/server/db";
import { requireAuth, newId } from "@/server/auth";
import { moderateContent, stripContactInfo } from "@/server/moderation";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const READ_STATUSES = [
  "assigned",
  "in_progress",
  "submitted",
  "completed",
  "disputed",
  "resolved",
];

const SEND_STATUSES = ["assigned", "in_progress", "submitted"];

const SendSchema = z.object({ body: z.string().min(1) });

async function fetchTaskParticipants(id: string, userId: string) {
  const task = await queryOne<{
    requester_id: string;
    assigned_doer_id: string | null;
    status: string;
  }>(
    `SELECT requester_id, assigned_doer_id, status FROM tasks WHERE id = $1`,
    [id],
  );
  if (!task) throw notFound("Task not found");
  if (task.requester_id !== userId && task.assigned_doer_id !== userId) {
    throw forbidden("Not a participant in this task");
  }
  return task;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const task = await fetchTaskParticipants(id, auth.userId);
    if (!READ_STATUSES.includes(task.status)) {
      throw badRequest("Messages only available after task assignment");
    }
    const rows = await query(
      `SELECT * FROM task_messages WHERE task_id = $1 ORDER BY created_at ASC`,
      [id],
    );
    return ok(rows);
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const body = await parseBody(req, SendSchema);
    const task = await fetchTaskParticipants(id, auth.userId);
    if (!SEND_STATUSES.includes(task.status)) {
      throw badRequest("Cannot send messages in current task state");
    }

    const m = moderateContent(body.body);
    if (m.kind === "rejected") throw contentRejected(m.reason);

    const sanitized = stripContactInfo(body.body);
    const msgId = newId();
    await execute(
      `INSERT INTO task_messages (id, task_id, sender_id, body, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [msgId, id, auth.userId, sanitized],
    );
    return ok({ id: msgId, body: sanitized }, 201);
  });
}
