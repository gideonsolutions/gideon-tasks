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
import { requireBackgroundCheck } from "@/server/minor-safeguards";
import { requireTaxQualification } from "@/server/tax-prep-gate";

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
      for_minor: boolean;
      category_slug: string | null;
    }>(
      `SELECT t.requester_id, t.status, t.for_minor, c.slug AS category_slug
       FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.requester_id === auth.userId) {
      throw badRequest("Cannot ask a question on your own task");
    }
    if (task.status !== "published") {
      throw badRequest("Questions are only allowed on published tasks");
    }

    // Only tutors who could be booked may ask about tutoring for a child.
    if (task.for_minor) await requireBackgroundCheck(auth.userId);
    // Only preparers who could be booked may ask about a Tax Prep task.
    await requireTaxQualification(auth.userId, task.category_slug);

    const moderation = moderateContent(body.question_body, {
      categorySlug: task.category_slug,
      forMinor: task.for_minor,
    });
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
