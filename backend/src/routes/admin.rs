use axum::{
    Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::middleware::{AdminUser, AppState};
use crate::errors::{AppError, AppResult};
use crate::models::audit::AuditLogEntry;
use crate::models::moderation::ModerationLogEntry;
use crate::models::task::Task;
use crate::services::audit::{log_audit, log_moderation};

/// List moderation queue (flagged items).
pub async fn moderation_queue(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<impl IntoResponse> {
    let flagged = sqlx::query_as::<_, ModerationLogEntry>(
        r#"
        SELECT * FROM moderation_log
        WHERE action = 'flagged'
        ORDER BY created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    // Also get tasks in pending_review
    let pending_tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE status = 'pending_review' ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "flagged_entries": flagged,
        "pending_tasks": pending_tasks,
    })))
}

/// Approve flagged content (e.g., publish a pending_review task).
pub async fn approve_moderation(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.status != "pending_review" {
        return Err(AppError::BadRequest("Task is not pending review".into()));
    }

    sqlx::query("UPDATE tasks SET status = 'published', updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await?;

    log_moderation(
        &state.db,
        "task",
        task_id,
        "approved",
        Some("Manual admin approval"),
        Some(admin.0.user_id),
    )
    .await?;

    log_audit(
        &state.db,
        Some(admin.0.user_id),
        "admin.moderation.approved",
        "task",
        task_id,
        Some(serde_json::json!({ "status": "pending_review" })),
        Some(serde_json::json!({ "status": "published" })),
        None,
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Task approved and published" }),
    ))
}

/// Reject flagged content.
#[derive(Debug, Deserialize)]
pub struct RejectRequest {
    pub reason: String,
}

pub async fn reject_moderation(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(task_id): Path<Uuid>,
    Json(req): Json<RejectRequest>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.status != "pending_review" {
        return Err(AppError::BadRequest("Task is not pending review".into()));
    }

    sqlx::query(
        "UPDATE tasks SET status = 'rejected', rejection_reason = $1, updated_at = now() WHERE id = $2",
    )
    .bind(&req.reason)
    .bind(task_id)
    .execute(&state.db)
    .await?;

    log_moderation(
        &state.db,
        "task",
        task_id,
        "rejected",
        Some(&req.reason),
        Some(admin.0.user_id),
    )
    .await?;

    log_audit(
        &state.db,
        Some(admin.0.user_id),
        "admin.moderation.rejected",
        "task",
        task_id,
        Some(serde_json::json!({ "status": "pending_review" })),
        Some(serde_json::json!({ "status": "rejected", "reason": &req.reason })),
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Task rejected" })))
}

/// List open disputes.
pub async fn list_disputes(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<impl IntoResponse> {
    let disputes = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE status = 'disputed' ORDER BY updated_at ASC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "disputes": disputes })))
}

/// Resolve a dispute. Either release payment to doer or refund to requester.
#[derive(Debug, Deserialize)]
pub struct ResolveDisputeRequest {
    /// "release" (pay doer) or "refund" (refund requester)
    pub resolution: String,
    pub notes: Option<String>,
}

pub async fn resolve_dispute(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(task_id): Path<Uuid>,
    Json(req): Json<ResolveDisputeRequest>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.status != "disputed" {
        return Err(AppError::BadRequest("Task is not disputed".into()));
    }

    match req.resolution.as_str() {
        "release" => {
            // Pay the doer
            crate::services::payments::release_payment(
                &state.db,
                &state.config.stripe_secret_key,
                task_id,
            )
            .await?;
        }
        "refund" => {
            // Refund the requester (Gideon absorbs its fee)
            crate::services::payments::refund_payment(
                &state.db,
                &state.config.stripe_secret_key,
                task_id,
            )
            .await?;

            // Record dispute loss for doer
            if let Some(doer_id) = task.assigned_doer_id {
                crate::services::reputation::recompute_reputation(&state.db, doer_id).await?;
                crate::services::trust::update_user_trust_level(&state.db, doer_id).await?;

                // Check for automatic suspension: 3+ disputes lost in 30 days
                let recent_losses: Option<i64> = sqlx::query_scalar(
                    r#"
                    SELECT COUNT(*) FROM tasks t
                    JOIN payments p ON p.task_id = t.id
                    WHERE t.assigned_doer_id = $1
                    AND t.status = 'resolved'
                    AND p.status = 'refunded'
                    AND t.updated_at > now() - interval '30 days'
                    "#,
                )
                .bind(doer_id)
                .fetch_one(&state.db)
                .await?;
                let recent_losses = recent_losses.unwrap_or(0);

                if recent_losses >= 3 {
                    sqlx::query(
                        "UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1",
                    )
                    .bind(doer_id)
                    .execute(&state.db)
                    .await?;

                    log_audit(
                        &state.db,
                        None,
                        "user.auto_suspended",
                        "user",
                        doer_id,
                        None,
                        Some(serde_json::json!({ "reason": "3+ disputes lost in 30 days" })),
                        None,
                    )
                    .await?;
                }
            }
        }
        _ => {
            return Err(AppError::BadRequest(
                "Resolution must be 'release' or 'refund'".into(),
            ));
        }
    }

    sqlx::query("UPDATE tasks SET status = 'resolved', updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(admin.0.user_id),
        "admin.dispute.resolved",
        "task",
        task_id,
        Some(serde_json::json!({ "status": "disputed" })),
        Some(serde_json::json!({ "status": "resolved", "resolution": &req.resolution, "notes": &req.notes })),
        None,
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": format!("Dispute resolved: {}", req.resolution) }),
    ))
}

#[derive(Debug, Deserialize)]
pub struct AuditLogQuery {
    pub entity_type: Option<String>,
    pub entity_id: Option<Uuid>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

/// Query audit log.
pub async fn query_audit_log(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(query): Query<AuditLogQuery>,
) -> AppResult<impl IntoResponse> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(50).min(200);
    let offset = (page - 1) * per_page;

    let entries = match (&query.entity_type, query.entity_id) {
        (Some(entity_type), Some(entity_id)) => {
            sqlx::query_as::<_, AuditLogEntry>(
                r#"
                SELECT * FROM audit_log
                WHERE entity_type = $1 AND entity_id = $2
                ORDER BY created_at DESC LIMIT $3 OFFSET $4
                "#,
            )
            .bind(entity_type)
            .bind(entity_id)
            .bind(per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        }
        (Some(entity_type), None) => {
            sqlx::query_as::<_, AuditLogEntry>(
                r#"
                SELECT * FROM audit_log
                WHERE entity_type = $1
                ORDER BY created_at DESC LIMIT $2 OFFSET $3
                "#,
            )
            .bind(entity_type)
            .bind(per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        }
        _ => {
            sqlx::query_as::<_, AuditLogEntry>(
                "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2",
            )
            .bind(per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        }
    };

    Ok(Json(serde_json::json!({
        "entries": entries,
        "page": page,
        "per_page": per_page,
    })))
}

/// Suspend a user.
pub async fn suspend_user(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(user_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    sqlx::query("UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(admin.0.user_id),
        "admin.user.suspended",
        "user",
        user_id,
        None,
        Some(serde_json::json!({ "status": "suspended" })),
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "User suspended" })))
}

/// Ban a user.
pub async fn ban_user(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(user_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    sqlx::query("UPDATE users SET status = 'banned', updated_at = now() WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    // Revoke all refresh tokens
    sqlx::query("DELETE FROM refresh_tokens WHERE user_id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(admin.0.user_id),
        "admin.user.banned",
        "user",
        user_id,
        None,
        Some(serde_json::json!({ "status": "banned" })),
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "User banned" })))
}
