use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppResult;

/// Recompute reputation summary for a user.
/// Called after task completion, review submission, or dispute resolution.
pub async fn recompute_reputation(db: &PgPool, user_id: Uuid) -> AppResult<()> {
    // Count completed tasks (as doer)
    let total_completed: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tasks WHERE assigned_doer_id = $1 AND status = 'completed'",
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    let total_completed = total_completed.unwrap_or(0);

    // Count cancelled by doer + disputes lost
    let cancelled_by_doer: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM tasks
        WHERE assigned_doer_id = $1 AND status = 'cancelled'
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    let cancelled_by_doer = cancelled_by_doer.unwrap_or(0);

    // Disputes lost (resolved against this user as doer)
    let disputes_lost: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM tasks
        WHERE assigned_doer_id = $1 AND status = 'resolved'
        AND id IN (
            SELECT task_id FROM payments WHERE doer_id = $1 AND status = 'refunded'
        )
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    let disputes_lost = disputes_lost.unwrap_or(0);

    let denominator = total_completed + cancelled_by_doer + disputes_lost;
    let completion_rate = if denominator > 0 {
        total_completed as f32 / denominator as f32
    } else {
        0.0
    };

    // On-time rate: completed tasks where completion happened before deadline
    let on_time: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM tasks
        WHERE assigned_doer_id = $1 AND status = 'completed' AND updated_at <= deadline
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    let on_time = on_time.unwrap_or(0);

    let on_time_rate = if total_completed > 0 {
        on_time as f32 / total_completed as f32
    } else {
        0.0
    };

    // Average review scores
    let review_stats: Option<(Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<i64>)> =
        sqlx::query_as(
            r#"
            SELECT
                AVG(reliability::double precision),
                AVG(quality::double precision),
                AVG(communication::double precision),
                AVG(integrity::double precision),
                COUNT(*)
            FROM reviews
            WHERE reviewee_id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(db)
        .await?;

    let (avg_reliability, avg_quality, avg_communication, avg_integrity, review_count) =
        match review_stats {
            Some((a, b, c, d, e)) => (a, b, c, d, e.unwrap_or(0)),
            None => (None, None, None, None, 0),
        };

    // Positive review rate (all dimensions >= 3)
    let positive_count: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM reviews
        WHERE reviewee_id = $1
        AND reliability >= 3 AND quality >= 3 AND communication >= 3 AND integrity >= 3
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    let positive_count = positive_count.unwrap_or(0);

    let positive_review_rate = if review_count > 0 {
        positive_count as f32 / review_count as f32
    } else {
        0.0
    };

    // Upsert reputation summary
    sqlx::query(
        r#"
        INSERT INTO reputation_summary
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
            updated_at = now()
        "#,
    )
    .bind(user_id)
    .bind(total_completed as i32)
    .bind(completion_rate)
    .bind(on_time_rate)
    .bind(avg_reliability.unwrap_or(0.0) as f32)
    .bind(avg_quality.unwrap_or(0.0) as f32)
    .bind(avg_communication.unwrap_or(0.0) as f32)
    .bind(avg_integrity.unwrap_or(0.0) as f32)
    .bind(disputes_lost as i32)
    .bind(positive_review_rate)
    .execute(db)
    .await?;

    Ok(())
}
