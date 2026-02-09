use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppResult;

/// Write an entry to the append-only audit log.
/// This function never fails silently — audit logging failures are errors.
#[allow(clippy::too_many_arguments)]
pub async fn log_audit(
    db: &PgPool,
    actor_id: Option<Uuid>,
    action: &str,
    entity_type: &str,
    entity_id: Uuid,
    old_value: Option<serde_json::Value>,
    new_value: Option<serde_json::Value>,
    ip_address: Option<String>,
) -> AppResult<()> {
    let id = Uuid::now_v7();

    sqlx::query(
        r#"
        INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, old_value, new_value, ip_address, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, now())
        "#,
    )
    .bind(id)
    .bind(actor_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(old_value)
    .bind(new_value)
    .bind(ip_address)
    .execute(db)
    .await?;

    Ok(())
}

/// Write an entry to the moderation log.
pub async fn log_moderation(
    db: &PgPool,
    entity_type: &str,
    entity_id: Uuid,
    action: &str,
    reason: Option<&str>,
    moderator_id: Option<Uuid>,
) -> AppResult<()> {
    let id = Uuid::now_v7();

    sqlx::query(
        r#"
        INSERT INTO moderation_log (id, entity_type, entity_id, action, reason, moderator_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        "#,
    )
    .bind(id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(action)
    .bind(reason)
    .bind(moderator_id)
    .execute(db)
    .await?;

    Ok(())
}
