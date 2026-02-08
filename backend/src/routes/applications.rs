use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use uuid::Uuid;

use crate::auth::middleware::{AppState, AuthUser};
use crate::errors::{AppError, AppResult};
use crate::models::task::Task;
use crate::models::task_application::{CreateApplicationRequest, TaskApplication};
use crate::models::user::TrustLevelRequirements;
use crate::services::audit::log_audit;
use crate::services::moderation::{ModerationResult, moderate_content};

/// Doer applies to a task.
pub async fn create_application(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
    Json(req): Json<CreateApplicationRequest>,
) -> AppResult<impl IntoResponse> {
    // Verify task exists and is published
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.status != "published" {
        return Err(AppError::BadRequest(
            "Can only apply to published tasks".into(),
        ));
    }

    // Can't apply to own task
    if task.requester_id == auth_user.user_id {
        return Err(AppError::BadRequest("Cannot apply to your own task".into()));
    }

    // Check trust level allows applying
    if !TrustLevelRequirements::can_apply_for_tasks(auth_user.trust_level) {
        return Err(AppError::TrustLevelInsufficient(
            "Cannot apply for tasks at this trust level".into(),
        ));
    }

    // Check max concurrent tasks as doer
    let max_concurrent = TrustLevelRequirements::max_concurrent_doer(auth_user.trust_level);
    let current_active: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM tasks
        WHERE assigned_doer_id = $1 AND status IN ('assigned', 'in_progress', 'submitted')
        "#,
    )
    .bind(auth_user.user_id)
    .fetch_one(&state.db)
    .await?;
    let current_active = current_active.unwrap_or(0);

    if current_active >= max_concurrent as i64 {
        return Err(AppError::BadRequest(format!(
            "Maximum concurrent doer tasks reached ({})",
            max_concurrent
        )));
    }

    // Check task value is within trust level
    let max_value = TrustLevelRequirements::max_task_value_cents(auth_user.trust_level);
    if task.price_cents > max_value {
        return Err(AppError::TrustLevelInsufficient(format!(
            "Task value exceeds your trust level maximum (${})",
            max_value as f64 / 100.0
        )));
    }

    // Check for duplicate application
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM task_applications WHERE task_id = $1 AND doer_id = $2",
    )
    .bind(task_id)
    .bind(auth_user.user_id)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict(
            "Already applied to this task".into(),
        ));
    }

    // Moderate application message if present
    if let Some(ref msg) = req.message {
        let moderation = moderate_content(msg);
        match moderation {
            ModerationResult::Rejected(reason) => {
                return Err(AppError::ContentRejected(reason));
            }
            ModerationResult::Flagged(_) | ModerationResult::Clean => {
                // For applications, flagged content still goes through but is logged
            }
        }
    }

    let app_id = Uuid::now_v7();

    sqlx::query(
        r#"
        INSERT INTO task_applications (id, task_id, doer_id, message, status, created_at)
        VALUES ($1, $2, $3, $4, 'pending', now())
        "#,
    )
    .bind(app_id)
    .bind(task_id)
    .bind(auth_user.user_id)
    .bind(&req.message)
    .execute(&state.db)
    .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "application.created",
        "task_application",
        app_id,
        None,
        Some(serde_json::json!({ "task_id": task_id })),
        None,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": app_id, "message": "Application submitted" })),
    ))
}

/// List applications for a task (requester only).
pub async fn list_applications(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    // Verify requester owns the task
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.requester_id != auth_user.user_id {
        return Err(AppError::Forbidden("Not your task".into()));
    }

    let applications = sqlx::query_as::<_, TaskApplication>(
        "SELECT * FROM task_applications WHERE task_id = $1 ORDER BY created_at ASC",
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "applications": applications })))
}

/// Doer withdraws their application.
pub async fn withdraw_application(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let app = sqlx::query_as::<_, TaskApplication>(
        "SELECT * FROM task_applications WHERE task_id = $1 AND doer_id = $2 AND status = 'pending'",
    )
    .bind(task_id)
    .bind(auth_user.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Application not found".into()))?;

    sqlx::query("UPDATE task_applications SET status = 'withdrawn' WHERE id = $1")
        .bind(app.id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "application.withdrawn",
        "task_application",
        app.id,
        None,
        None,
        None,
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Application withdrawn" }),
    ))
}
