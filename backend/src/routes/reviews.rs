use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{Duration, Utc};
use uuid::Uuid;

use crate::auth::middleware::{AppState, AuthUser};
use crate::errors::{AppError, AppResult};
use crate::models::review::{CreateReviewRequest, Review};
use crate::models::task::Task;
use crate::services::moderation::{ModerationResult, moderate_content};

/// Leave a review after task completion. Both parties have 7 days.
/// Reviews are permanent and public. No edits, no deletions.
pub async fn create_review(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(task_id): Path<Uuid>,
    Json(req): Json<CreateReviewRequest>,
) -> AppResult<impl IntoResponse> {
    req.validate().map_err(|e| AppError::BadRequest(e))?;

    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Task not found".into()))?;

    // Task must be completed
    if task.status != "completed" {
        return Err(AppError::BadRequest(
            "Reviews can only be left after task completion".into(),
        ));
    }

    // Reviewer must be requester or doer
    let is_requester = task.requester_id == auth_user.user_id;
    let is_doer = task.assigned_doer_id == Some(auth_user.user_id);

    if !is_requester && !is_doer {
        return Err(AppError::Forbidden("Not a participant in this task".into()));
    }

    // 7-day review window
    let review_deadline = task.updated_at + Duration::days(7);
    if Utc::now() > review_deadline {
        return Err(AppError::BadRequest("Review window has closed (7 days)".into()));
    }

    // Determine reviewee
    let reviewee_id = if is_requester {
        task.assigned_doer_id
            .ok_or_else(|| AppError::Internal("Task has no assigned doer".into()))?
    } else {
        task.requester_id
    };

    // Check for duplicate review
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM reviews WHERE task_id = $1 AND reviewer_id = $2",
    )
    .bind(task_id)
    .bind(auth_user.user_id)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict(
            "Already reviewed this task".into(),
        ));
    }

    // Moderate comment if present
    if let Some(ref comment) = req.comment {
        let moderation = moderate_content(comment);
        if let ModerationResult::Rejected(reason) = moderation {
            return Err(AppError::ContentRejected(reason));
        }
    }

    let review_id = Uuid::now_v7();

    sqlx::query(
        r#"
        INSERT INTO reviews
            (id, task_id, reviewer_id, reviewee_id, reliability, quality,
             communication, integrity, comment, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        "#,
    )
    .bind(review_id)
    .bind(task_id)
    .bind(auth_user.user_id)
    .bind(reviewee_id)
    .bind(req.reliability)
    .bind(req.quality)
    .bind(req.communication)
    .bind(req.integrity)
    .bind(&req.comment)
    .execute(&state.db)
    .await?;

    // Recompute reviewee's reputation and trust level
    crate::services::reputation::recompute_reputation(&state.db, reviewee_id).await?;
    crate::services::trust::update_user_trust_level(&state.db, reviewee_id).await?;

    crate::services::audit::log_audit(
        &state.db,
        Some(auth_user.user_id),
        "review.created",
        "review",
        review_id,
        None,
        Some(serde_json::json!({
            "task_id": task_id,
            "reviewee_id": reviewee_id,
            "reliability": req.reliability,
            "quality": req.quality,
            "communication": req.communication,
            "integrity": req.integrity,
        })),
        None,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": review_id, "message": "Review submitted" })),
    ))
}

/// List reviews for a user.
pub async fn list_user_reviews(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let reviews = sqlx::query_as::<_, Review>(
        "SELECT * FROM reviews WHERE reviewee_id = $1 ORDER BY created_at DESC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "reviews": reviews })))
}
