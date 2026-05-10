import "server-only";
import { execute, queryOne } from "./db";

export async function recomputeReputation(userId: string): Promise<void> {
  const totals = await queryOne<{
    total_completed: number;
    cancelled_by_doer: number;
    on_time: number;
    disputes_lost: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM tasks WHERE assigned_doer_id = $1 AND status = 'completed') AS total_completed,
       (SELECT COUNT(*)::int FROM tasks WHERE assigned_doer_id = $1 AND status = 'cancelled') AS cancelled_by_doer,
       (SELECT COUNT(*)::int FROM tasks WHERE assigned_doer_id = $1 AND status = 'completed' AND updated_at <= deadline) AS on_time,
       (SELECT COUNT(*)::int FROM tasks t WHERE t.assigned_doer_id = $1 AND t.status = 'resolved'
          AND t.id IN (SELECT task_id FROM payments WHERE doer_id = $1 AND status = 'refunded')) AS disputes_lost`,
    [userId],
  );

  const totalCompleted = totals?.total_completed ?? 0;
  const cancelledByDoer = totals?.cancelled_by_doer ?? 0;
  const disputesLost = totals?.disputes_lost ?? 0;
  const onTime = totals?.on_time ?? 0;

  const denom = totalCompleted + cancelledByDoer + disputesLost;
  const completionRate = denom > 0 ? totalCompleted / denom : 0;
  const onTimeRate = totalCompleted > 0 ? onTime / totalCompleted : 0;

  const reviewStats = await queryOne<{
    avg_reliability: number | null;
    avg_quality: number | null;
    avg_communication: number | null;
    avg_integrity: number | null;
    review_count: number;
    positive_count: number;
  }>(
    `SELECT
       AVG(reliability::float)::float AS avg_reliability,
       AVG(quality::float)::float AS avg_quality,
       AVG(communication::float)::float AS avg_communication,
       AVG(integrity::float)::float AS avg_integrity,
       COUNT(*)::int AS review_count,
       COUNT(*) FILTER (WHERE reliability >= 3 AND quality >= 3 AND communication >= 3 AND integrity >= 3)::int AS positive_count
     FROM reviews WHERE reviewee_id = $1`,
    [userId],
  );

  const reviewCount = reviewStats?.review_count ?? 0;
  const positiveCount = reviewStats?.positive_count ?? 0;
  const positiveReviewRate = reviewCount > 0 ? positiveCount / reviewCount : 0;

  await execute(
    `INSERT INTO reputation_summary
       (user_id, total_completed, completion_rate, on_time_rate,
        avg_reliability, avg_quality, avg_communication, avg_integrity,
        disputes_lost, positive_review_rate, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (user_id) DO UPDATE SET
       total_completed = EXCLUDED.total_completed,
       completion_rate = EXCLUDED.completion_rate,
       on_time_rate = EXCLUDED.on_time_rate,
       avg_reliability = EXCLUDED.avg_reliability,
       avg_quality = EXCLUDED.avg_quality,
       avg_communication = EXCLUDED.avg_communication,
       avg_integrity = EXCLUDED.avg_integrity,
       disputes_lost = EXCLUDED.disputes_lost,
       positive_review_rate = EXCLUDED.positive_review_rate,
       updated_at = now()`,
    [
      userId,
      totalCompleted,
      completionRate,
      onTimeRate,
      reviewStats?.avg_reliability ?? 0,
      reviewStats?.avg_quality ?? 0,
      reviewStats?.avg_communication ?? 0,
      reviewStats?.avg_integrity ?? 0,
      disputesLost,
      positiveReviewRate,
    ],
  );
}
