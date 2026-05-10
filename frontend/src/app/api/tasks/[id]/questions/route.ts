import { z } from "zod";
import {
  handle,
  notFound,
  badRequest,
  contentRejected,
} from "@/server/errors";
import { execute, query, queryOne } from "@/server/db";
import { requireAuth, newId } from "@/server/auth";
import { moderateContent } from "@/server/moderation";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const AskSchema = z.object({ question_body: z.string().min(1).max(2000) });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const exists = await queryOne(`SELECT 1 FROM tasks WHERE id = $1`, [id]);
    if (!exists) throw notFound("Task not found");
    const rows = await query(
      `SELECT * FROM task_questions WHERE task_id = $1 ORDER BY created_at ASC`,
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
    const body = await parseBody(req, AskSchema);

    const task = await queryOne<{
      requester_id: string;
      status: string;
    }>(`SELECT requester_id, status FROM tasks WHERE id = $1`, [id]);
    if (!task) throw notFound("Task not found");
    if (task.requester_id === auth.userId) {
      throw badRequest("Cannot ask a question on your own task");
    }
    if (task.status !== "published") {
      throw badRequest("Questions are only allowed on published tasks");
    }

    const moderation = moderateContent(body.question_body);
    if (moderation.kind === "rejected") throw contentRejected(moderation.reason);

    const qid = newId();
    await execute(
      `INSERT INTO task_questions (id, task_id, asker_id, question_body, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [qid, id, auth.userId, body.question_body],
    );
    await logAudit(
      auth.userId,
      "question.asked",
      "task_question",
      qid,
      null,
      { task_id: id },
    );
    return ok({ id: qid, message: "Question posted" }, 201);
  });
}
