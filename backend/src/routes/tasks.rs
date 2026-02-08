use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::middleware::{AppState, AuthUser};
use crate::errors::{AppError, AppResult};
use crate::models::task::{Task, TaskStatus, MIN_TASK_PRICE_CENTS};
use crate::models::user::TrustLevelRequirements;
use crate::services::audit::log_audit;
use crate::services::moderation::{ModerationResult, moderate_content};
use crate::services::payments;

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: String,
    pub category_id: Uuid,
    pub location_type: String,
    pub location_address: Option<String>,
    pub location_lat: Option<f64>,
    pub location_lng: Option<f64>,
    pub price_cents: i64,
    pub deadline: chrono::DateTime<Utc>,
}

pub async fn create_task(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(req): Json<CreateTaskRequest>,
) -> AppResult<impl IntoResponse> {
    // Check trust level for posting
    if !TrustLevelRequirements::can_post_tasks(auth_user.trust_level) {
        return Err(AppError::TrustLevelInsufficient(
            "Trust Level 1 required to post tasks".into(),
        ));
    }

    // Check max active posted tasks
    let max_active = TrustLevelRequirements::max_active_posted(auth_user.trust_level)
        .ok_or_else(|| {
            AppError::TrustLevelInsufficient("Cannot post tasks at this trust level".into())
        })?;

    let active_count: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM tasks
        WHERE requester_id = $1 AND status NOT IN ('completed', 'resolved', 'cancelled', 'expired', 'rejected')
        "#,
    )
    .bind(auth_user.user_id)
    .fetch_one(&state.db)
    .await?;
    let active_count = active_count.unwrap_or(0);

    if active_count >= max_active as i64 {
        return Err(AppError::BadRequest(format!(
            "Maximum active tasks reached ({})",
            max_active
        )));
    }

    // Validate price
    if req.price_cents < MIN_TASK_PRICE_CENTS {
        return Err(AppError::BadRequest(format!(
            "Minimum task price is ${}",
            MIN_TASK_PRICE_CENTS as f64 / 100.0
        )));
    }

    let max_value = TrustLevelRequirements::max_task_value_cents(auth_user.trust_level);
    if req.price_cents > max_value {
        return Err(AppError::TrustLevelInsufficient(format!(
            "Maximum task value at your trust level is ${}",
            max_value as f64 / 100.0
        )));
    }

    // Validate deadline is in the future
    if req.deadline <= Utc::now() {
        return Err(AppError::BadRequest("Deadline must be in the future".into()));
    }

    // Validate location
    if req.location_type == "in_person" && req.location_address.is_none() {
        return Err(AppError::BadRequest(
            "Address required for in-person tasks".into(),
        ));
    }

    let task_id = Uuid::now_v7();

    sqlx::query(
        r#"
        INSERT INTO tasks
            (id, requester_id, title, description, category_id, location_type,
             location_address, location_lat, location_lng, price_cents, status,
             deadline, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, now(), now())
        "#,
    )
    .bind(task_id)
    .bind(auth_user.user_id)
    .bind(&req.title)
    .bind(&req.description)
    .bind(req.category_id)
    .bind(&req.location_type)
    .bind(&req.location_address)
    .bind(req.location_lat)
    .bind(req.location_lng)
    .bind(req.price_cents)
    .bind(req.deadline)
    .execute(&state.db)
    .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "task.created",
        "task",
        task_id,
        None,
        Some(serde_json::json!({ "title": &req.title, "price_cents": req.price_cents })),
        None,
    )
    .await?;

    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_one(&state.db)
        .await?;

    Ok((StatusCode::CREATED, Json(task)))
}

#[derive(Debug, Deserialize)]
pub struct ListTasksQuery {
    pub category_id: Option<Uuid>,
    pub location_type: Option<String>,
    pub min_price_cents: Option<i64>,
    pub max_price_cents: Option<i64>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

pub async fn list_tasks(
    State(state): State<AppState>,
    Query(query): Query<ListTasksQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(20).min(100);
    let offset = (page - 1) * per_page;

    let tasks = match (query.category_id, &query.location_type) {
        (Some(cat_id), Some(loc_type)) => {
            sqlx::query_as::<_, Task>(
                r#"
                SELECT * FROM tasks WHERE status = 'published'
                AND category_id = $1 AND location_type = $2
                ORDER BY created_at DESC LIMIT $3 OFFSET $4
                "#,
            )
            .bind(cat_id)
            .bind(loc_type)
            .bind(per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        }
        (Some(cat_id), None) => {
            sqlx::query_as::<_, Task>(
                r#"
                SELECT * FROM tasks WHERE status = 'published'
                AND category_id = $1
                ORDER BY created_at DESC LIMIT $2 OFFSET $3
                "#,
            )
            .bind(cat_id)
            .bind(per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        }
        (None, Some(loc_type)) => {
            sqlx::query_as::<_, Task>(
                r#"
                SELECT * FROM tasks WHERE status = 'published'
                AND location_type = $1
                ORDER BY created_at DESC LIMIT $2 OFFSET $3
                "#,
            )
            .bind(loc_type)
            .bind(per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        }
        (None, None) => {
            sqlx::query_as::<_, Task>(
                r#"
                SELECT * FROM tasks WHERE status = 'published'
                ORDER BY created_at DESC LIMIT $1 OFFSET $2
                "#,
            )
            .bind(per_page)
            .bind(offset)
            .fetch_all(&state.db)
            .await?
        }
    };

    Ok(Json(serde_json::json!({
        "tasks": tasks,
        "page": page,
        "per_page": per_page,
    })))
}

pub async fn get_task(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    Ok(Json(task))
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub category_id: Option<Uuid>,
    pub location_type: Option<String>,
    pub location_address: Option<String>,
    pub price_cents: Option<i64>,
    pub deadline: Option<chrono::DateTime<Utc>>,
}

pub async fn update_task(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
    Json(req): Json<UpdateTaskRequest>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.requester_id != auth_user.user_id {
        return Err(AppError::Forbidden("Not your task".into()));
    }

    if task.status != "draft" {
        return Err(AppError::BadRequest("Can only edit draft tasks".into()));
    }

    let title = req.title.unwrap_or(task.title);
    let description = req.description.unwrap_or(task.description);
    let category_id = req.category_id.unwrap_or(task.category_id);
    let location_type = req.location_type.unwrap_or(task.location_type);
    let location_address = req.location_address.or(task.location_address);
    let price_cents = req.price_cents.unwrap_or(task.price_cents);
    let deadline = req.deadline.unwrap_or(task.deadline);

    if price_cents < MIN_TASK_PRICE_CENTS {
        return Err(AppError::BadRequest(format!(
            "Minimum task price is ${}",
            MIN_TASK_PRICE_CENTS as f64 / 100.0
        )));
    }

    sqlx::query(
        r#"
        UPDATE tasks
        SET title = $1, description = $2, category_id = $3, location_type = $4,
            location_address = $5, price_cents = $6, deadline = $7, updated_at = now()
        WHERE id = $8
        "#,
    )
    .bind(&title)
    .bind(&description)
    .bind(category_id)
    .bind(&location_type)
    .bind(&location_address)
    .bind(price_cents)
    .bind(deadline)
    .bind(task_id)
    .execute(&state.db)
    .await?;

    let updated = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(updated))
}

/// Submit a draft task for moderation → publish.
pub async fn publish_task(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.requester_id != auth_user.user_id {
        return Err(AppError::Forbidden("Not your task".into()));
    }

    // Validate state transition: DRAFT → PENDING_REVIEW
    let current = TaskStatus::from_str(&task.status)
        .ok_or_else(|| AppError::Internal("Invalid task status".into()))?;
    current.transition_to(TaskStatus::PendingReview)?;

    // Run content moderation
    let combined_text = format!("{} {}", task.title, task.description);
    let moderation = moderate_content(&combined_text);

    match moderation {
        ModerationResult::Clean => {
            // Auto-approve: DRAFT → PENDING_REVIEW → PUBLISHED
            sqlx::query(
                "UPDATE tasks SET status = 'published', updated_at = now() WHERE id = $1",
            )
            .bind(task_id)
            .execute(&state.db)
            .await?;

            crate::services::audit::log_moderation(
                &state.db,
                "task",
                task_id,
                "approved",
                Some("Automated: content clean"),
                None,
            )
            .await?;

            log_audit(
                &state.db,
                Some(auth_user.user_id),
                "task.published",
                "task",
                task_id,
                Some(serde_json::json!({ "status": "draft" })),
                Some(serde_json::json!({ "status": "published" })),
                None,
            )
            .await?;

            let updated = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
                .bind(task_id)
                .fetch_one(&state.db)
                .await?;

            Ok(Json(serde_json::json!({
                "task": updated,
                "moderation": "approved",
            })))
        }
        ModerationResult::Rejected(reason) => {
            // Auto-reject: DRAFT → PENDING_REVIEW → REJECTED
            sqlx::query(
                r#"
                UPDATE tasks SET status = 'rejected', rejection_reason = $1, updated_at = now()
                WHERE id = $2
                "#,
            )
            .bind(&reason)
            .bind(task_id)
            .execute(&state.db)
            .await?;

            crate::services::audit::log_moderation(
                &state.db,
                "task",
                task_id,
                "rejected",
                Some(&reason),
                None,
            )
            .await?;

            Err(AppError::ContentRejected(reason))
        }
        ModerationResult::Flagged(reason) => {
            // Flagged: DRAFT → PENDING_REVIEW (awaiting manual review)
            sqlx::query(
                r#"
                UPDATE tasks SET status = 'pending_review', moderation_note = $1, updated_at = now()
                WHERE id = $2
                "#,
            )
            .bind(&reason)
            .bind(task_id)
            .execute(&state.db)
            .await?;

            crate::services::audit::log_moderation(
                &state.db,
                "task",
                task_id,
                "flagged",
                Some(&reason),
                None,
            )
            .await?;

            Err(AppError::ContentFlagged(reason))
        }
    }
}

/// Cancel a task.
pub async fn cancel_task(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.requester_id != auth_user.user_id {
        return Err(AppError::Forbidden("Not your task".into()));
    }

    let current = TaskStatus::from_str(&task.status)
        .ok_or_else(|| AppError::Internal("Invalid task status".into()))?;
    current.transition_to(TaskStatus::Cancelled)?;

    sqlx::query("UPDATE tasks SET status = 'cancelled', updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await?;

    // Refund if payment exists
    let has_payment: Option<bool> = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM payments WHERE task_id = $1)",
    )
    .bind(task_id)
    .fetch_one(&state.db)
    .await?;
    let has_payment = has_payment.unwrap_or(false);

    if has_payment {
        payments::refund_payment(&state.db, &state.config.stripe_secret_key, task_id).await?;
    }

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "task.cancelled",
        "task",
        task_id,
        Some(serde_json::json!({ "status": &task.status })),
        Some(serde_json::json!({ "status": "cancelled" })),
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Task cancelled" })))
}

/// Requester selects a doer from applications. Triggers payment escrow.
pub async fn assign_task(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path((task_id, application_id)): Path<(Uuid, Uuid)>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.requester_id != auth_user.user_id {
        return Err(AppError::Forbidden("Not your task".into()));
    }

    let current = TaskStatus::from_str(&task.status)
        .ok_or_else(|| AppError::Internal("Invalid task status".into()))?;
    current.transition_to(TaskStatus::Assigned)?;

    // Get the application
    let app = sqlx::query_as::<_, crate::models::task_application::TaskApplication>(
        "SELECT * FROM task_applications WHERE id = $1 AND task_id = $2 AND status = 'pending'",
    )
    .bind(application_id)
    .bind(task_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Application not found".into()))?;

    // Get requester's Stripe customer ID
    let requester_stripe_id: Option<String> = sqlx::query_scalar(
        "SELECT stripe_customer_id FROM users WHERE id = $1",
    )
    .bind(auth_user.user_id)
    .fetch_one(&state.db)
    .await?;

    let requester_stripe_id = requester_stripe_id
        .ok_or_else(|| AppError::PaymentError("Requester has no payment method on file".into()))?;

    // Create payment intent (escrow)
    let (_payment_id, client_secret) = payments::create_escrow_payment(
        &state.db,
        &state.config.stripe_secret_key,
        task_id,
        auth_user.user_id,
        app.doer_id,
        task.price_cents,
        &requester_stripe_id,
    )
    .await?;

    // Update task status and assign doer
    sqlx::query(
        r#"
        UPDATE tasks SET status = 'assigned', assigned_doer_id = $1, updated_at = now()
        WHERE id = $2
        "#,
    )
    .bind(app.doer_id)
    .bind(task_id)
    .execute(&state.db)
    .await?;

    // Accept this application, reject all others
    sqlx::query("UPDATE task_applications SET status = 'accepted' WHERE id = $1")
        .bind(application_id)
        .execute(&state.db)
        .await?;

    sqlx::query(
        "UPDATE task_applications SET status = 'rejected' WHERE task_id = $1 AND id != $2 AND status = 'pending'",
    )
    .bind(task_id)
    .bind(application_id)
    .execute(&state.db)
    .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "task.assigned",
        "task",
        task_id,
        Some(serde_json::json!({ "status": "published" })),
        Some(serde_json::json!({ "status": "assigned", "doer_id": app.doer_id })),
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({
        "message": "Task assigned",
        "payment_client_secret": client_secret,
    })))
}

/// Doer confirms start → captures payment.
pub async fn start_task(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.assigned_doer_id != Some(auth_user.user_id) {
        return Err(AppError::Forbidden("Not the assigned doer".into()));
    }

    let current = TaskStatus::from_str(&task.status)
        .ok_or_else(|| AppError::Internal("Invalid task status".into()))?;
    current.transition_to(TaskStatus::InProgress)?;

    // Capture payment
    payments::capture_payment(&state.db, &state.config.stripe_secret_key, task_id).await?;

    sqlx::query("UPDATE tasks SET status = 'in_progress', updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "task.started",
        "task",
        task_id,
        Some(serde_json::json!({ "status": "assigned" })),
        Some(serde_json::json!({ "status": "in_progress" })),
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Task started" })))
}

#[derive(Debug, Deserialize)]
pub struct SubmitTaskRequest {
    pub completion_notes: Option<String>,
}

/// Doer submits task completion.
pub async fn submit_task(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
    Json(req): Json<SubmitTaskRequest>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.assigned_doer_id != Some(auth_user.user_id) {
        return Err(AppError::Forbidden("Not the assigned doer".into()));
    }

    let current = TaskStatus::from_str(&task.status)
        .ok_or_else(|| AppError::Internal("Invalid task status".into()))?;
    current.transition_to(TaskStatus::Submitted)?;

    sqlx::query("UPDATE tasks SET status = 'submitted', updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "task.submitted",
        "task",
        task_id,
        Some(serde_json::json!({ "status": "in_progress" })),
        Some(serde_json::json!({ "status": "submitted", "notes": req.completion_notes })),
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Task submitted for review" })))
}

/// Requester approves completion → releases payment.
pub async fn approve_task(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.requester_id != auth_user.user_id {
        return Err(AppError::Forbidden("Not your task".into()));
    }

    let current = TaskStatus::from_str(&task.status)
        .ok_or_else(|| AppError::Internal("Invalid task status".into()))?;
    current.transition_to(TaskStatus::Completed)?;

    // Release payment to doer
    payments::release_payment(&state.db, &state.config.stripe_secret_key, task_id).await?;

    sqlx::query("UPDATE tasks SET status = 'completed', updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await?;

    // Recompute reputation for doer
    if let Some(doer_id) = task.assigned_doer_id {
        crate::services::reputation::recompute_reputation(&state.db, doer_id).await?;
        crate::services::trust::update_user_trust_level(&state.db, doer_id).await?;
    }

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "task.completed",
        "task",
        task_id,
        Some(serde_json::json!({ "status": "submitted" })),
        Some(serde_json::json!({ "status": "completed" })),
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Task completed. Payment released." })))
}

/// Requester disputes submission.
pub async fn dispute_task(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    if task.requester_id != auth_user.user_id {
        return Err(AppError::Forbidden("Not your task".into()));
    }

    let current = TaskStatus::from_str(&task.status)
        .ok_or_else(|| AppError::Internal("Invalid task status".into()))?;
    current.transition_to(TaskStatus::Disputed)?;

    sqlx::query("UPDATE tasks SET status = 'disputed', updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "task.disputed",
        "task",
        task_id,
        Some(serde_json::json!({ "status": "submitted" })),
        Some(serde_json::json!({ "status": "disputed" })),
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Task disputed. Awaiting admin resolution." })))
}
