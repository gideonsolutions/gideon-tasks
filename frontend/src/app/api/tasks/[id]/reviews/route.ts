import { z } from "zod";
import {
  handle,
  notFound,
  forbidden,
  badRequest,
  conflict,
  contentRejected,
} from "@/server/errors";
import { execute, query, queryOne } from "@/server/db";
import { requireAuth, newId } from "@/server/auth";
import { moderateContent } from "@/server/moderation";
import { recomputeReputation } from "@/server/reputation";
import { updateUserTrustLevel } from "@/server/trust";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const ReviewSchema = z.object({
  reliability: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  integrity: z.number().int().min(1).max(5),
  comment: z.string().optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const body = await parseBody(req, ReviewSchema);

    const task = await queryOne<{
      requester_id: string;
      assigned_doer_id: string | null;
      status: string;
      updated_at: string;
    }>(
      `SELECT requester_id, assigned_doer_id, status, updated_at FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.status !== "completed") {
      throw badRequest("Reviews can only be left after task completion");
    }
    const isRequester = task.requester_id === auth.userId;
    const isDoer = task.assigned_doer_id === auth.userId;
    if (!isRequester && !isDoer)
      throw forbidden("Not a participant in this task");

    const completedAt = new Date(task.updated_at).getTime();
    if (Date.now() > completedAt + 7 * 86_400_000) {
      throw badRequest("Review window has closed (7 days)");
    }

    const revieweeId = isRequester ? task.assigned_doer_id : task.requester_id;
    if (!revieweeId) throw badRequest("Task has no counterparty");

    const dup = await query(
      `SELECT 1 FROM reviews WHERE task_id = $1 AND reviewer_id = $2`,
      [id, auth.userId],
    );
    if (dup.length > 0) throw conflict("Already reviewed this task");

    if (body.comment) {
      const m = moderateContent(body.comment);
      if (m.kind === "rejected") throw contentRejected(m.reason);
    }

    const reviewId = newId();
    await execute(
      `INSERT INTO reviews
        (id, task_id, reviewer_id, reviewee_id, reliability, quality,
         communication, integrity, comment, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
      [
        reviewId,
        id,
        auth.userId,
        revieweeId,
        body.reliability,
        body.quality,
        body.communication,
        body.integrity,
        body.comment ?? null,
      ],
    );

    await recomputeReputation(revieweeId);
    await updateUserTrustLevel(revieweeId);
    await logAudit(auth.userId, "review.created", "review", reviewId, null, {
      task_id: id,
      reviewee_id: revieweeId,
    });

    return ok({ id: reviewId, message: "Review submitted" }, 201);
  });
}
