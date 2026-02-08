use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppResult;
use crate::models::reputation::ReputationSummary;

/// Compute the trust level a user qualifies for based on their actual data.
/// Level 3 additionally requires admin sign-off, so this function caps at Level 2
/// unless admin_approved is true.
///
/// | Level | Requirements |
/// |-------|-------------|
/// | 0 | Registration complete |
/// | 1 | 5+ completed, 0 disputes lost, account age >= 30d |
/// | 2 | 20+ completed, 0 unresolved disputes, age >= 90d, >= 90% positive |
/// | 3 | 50+ completed, age >= 180d, >= 95% positive, admin-reviewed |
pub async fn compute_trust_level(
    db: &PgPool,
    user_id: Uuid,
    admin_approved_level3: bool,
) -> AppResult<i16> {
    let user_created: Option<chrono::DateTime<Utc>> = sqlx::query_scalar(
        "SELECT created_at FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;

    let created_at = match user_created {
        Some(ts) => ts,
        None => return Ok(0),
    };

    let account_age_days = (Utc::now() - created_at).num_days();

    let rep: Option<ReputationSummary> = sqlx::query_as(
        "SELECT * FROM reputation_summary WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;

    let rep = match rep {
        Some(r) => r,
        None => return Ok(0),
    };

    // Check Level 3
    if admin_approved_level3
        && rep.total_completed >= 50
        && account_age_days >= 180
        && rep.positive_review_rate >= 0.95
    {
        return Ok(3);
    }

    // Check Level 2
    if rep.total_completed >= 20
        && rep.disputes_lost == 0
        && account_age_days >= 90
        && rep.positive_review_rate >= 0.90
    {
        return Ok(2);
    }

    // Check Level 1
    if rep.total_completed >= 5 && rep.disputes_lost == 0 && account_age_days >= 30 {
        return Ok(1);
    }

    Ok(0)
}

/// Recompute and update the user's trust level in the database.
pub async fn update_user_trust_level(db: &PgPool, user_id: Uuid) -> AppResult<i16> {
    // Check if user currently has admin-approved Level 3
    let current_level: Option<i16> =
        sqlx::query_scalar("SELECT trust_level FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(db)
            .await?;

    let admin_approved = current_level == Some(3);

    let new_level = compute_trust_level(db, user_id, admin_approved).await?;

    sqlx::query("UPDATE users SET trust_level = $1, updated_at = now() WHERE id = $2")
        .bind(new_level)
        .bind(user_id)
        .execute(db)
        .await?;

    Ok(new_level)
}
