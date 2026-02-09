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
use crate::models::task_message::{CreateMessageRequest, TaskMessage};
use crate::services::moderation::{ModerationResult, moderate_content, strip_contact_info};

/// List messages for a task (post-assignment only, task participants only).
pub async fn list_messages(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    // Only requester and assigned doer can view messages
    if task.requester_id != auth_user.user_id && task.assigned_doer_id != Some(auth_user.user_id) {
        return Err(AppError::Forbidden("Not a participant in this task".into()));
    }

    // Messages only available post-assignment
    let allowed_statuses = [
        "assigned",
        "in_progress",
        "submitted",
        "completed",
        "disputed",
        "resolved",
    ];
    if !allowed_statuses.contains(&task.status.as_str()) {
        return Err(AppError::BadRequest(
            "Messages only available after task assignment".into(),
        ));
    }

    let messages = sqlx::query_as::<_, TaskMessage>(
        "SELECT * FROM task_messages WHERE task_id = $1 ORDER BY created_at ASC",
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "messages": messages })))
}

/// Send a message on a task (post-assignment only, participants only).
pub async fn send_message(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
    Json(req): Json<CreateMessageRequest>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    // Only requester and assigned doer can send messages
    if task.requester_id != auth_user.user_id && task.assigned_doer_id != Some(auth_user.user_id) {
        return Err(AppError::Forbidden("Not a participant in this task".into()));
    }

    // Messages only available during active task phases
    let allowed_statuses = ["assigned", "in_progress", "submitted"];
    if !allowed_statuses.contains(&task.status.as_str()) {
        return Err(AppError::BadRequest(
            "Cannot send messages in current task state".into(),
        ));
    }

    // Content moderation — reject sexual/prohibited, strip contact info
    let moderation = moderate_content(&req.body);
    if let ModerationResult::Rejected(reason) = moderation {
        return Err(AppError::ContentRejected(reason));
    }

    // Strip contact info from messages (hard-coded policy: no pre-acceptance contact exchange)
    let sanitized_body = strip_contact_info(&req.body);

    let msg_id = Uuid::now_v7();

    sqlx::query(
        r#"
        INSERT INTO task_messages (id, task_id, sender_id, body, created_at)
        VALUES ($1, $2, $3, $4, now())
        "#,
    )
    .bind(msg_id)
    .bind(task_id)
    .bind(auth_user.user_id)
    .bind(&sanitized_body)
    .execute(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": msg_id,
            "body": sanitized_body,
        })),
    ))
}
