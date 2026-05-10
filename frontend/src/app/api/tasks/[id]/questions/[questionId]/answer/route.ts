import { z } from "zod";
import {
  handle,
  notFound,
  forbidden,
  badRequest,
  contentRejected,
} from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { moderateContent } from "@/server/moderation";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const AnswerSchema = z.object({ answer_body: z.string().min(1).max(2000) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id, questionId } = await params;
    const body = await parseBody(req, AnswerSchema);

    const question = await queryOne<{
      task_id: string;
      requester_id: string;
      answer_body: string | null;
    }>(
      `SELECT q.task_id, t.requester_id, q.answer_body
       FROM task_questions q
       JOIN tasks t ON t.id = q.task_id
       WHERE q.id = $1 AND q.task_id = $2`,
      [questionId, id],
    );
    if (!question) throw notFound("Question not found");
    if (question.requester_id !== auth.userId) {
      throw forbidden("Only the requester can answer");
    }
    if (question.answer_body) {
      throw badRequest("Question already answered");
    }

    const moderation = moderateContent(body.answer_body);
    if (moderation.kind === "rejected") throw contentRejected(moderation.reason);

    await execute(
      `UPDATE task_questions
       SET answer_body = $1, answered_by_id = $2, answered_at = now()
       WHERE id = $3`,
      [body.answer_body, auth.userId, questionId],
    );
    await logAudit(
      auth.userId,
      "question.answered",
      "task_question",
      questionId,
      null,
      { task_id: id },
    );
    return ok({ message: "Answer posted" });
  });
}
