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
use crate::models::attestation::Attestor;
use crate::models::invite::{CreateInviteRequest, Invite};

/// Create one or more invites (attestor-only).
pub async fn create_invites(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(req): Json<CreateInviteRequest>,
) -> AppResult<impl IntoResponse> {
    // Verify user is associated with an attestor
    let attestor = get_user_attestor(&state.db, auth_user.user_id).await?;

    let count = req.count.unwrap_or(1).min(50); // Cap at 50 per request

    // Check quota
    let used: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM invites WHERE attestor_id = $1",
    )
    .bind(attestor.id)
    .fetch_one(&state.db)
    .await?;
    let used = used.unwrap_or(0);

    if used + count as i64 > attestor.invite_quota as i64 {
        return Err(AppError::BadRequest("Invite quota exceeded".into()));
    }

    let mut invites = Vec::new();
    let expires_at = Utc::now() + Duration::days(30);

    for _ in 0..count {
        let id = Uuid::now_v7();
        let code = generate_invite_code();

        sqlx::query(
            r#"
            INSERT INTO invites (id, attestor_id, code, target_email, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5, now())
            "#,
        )
        .bind(id)
        .bind(attestor.id)
        .bind(&code)
        .bind(&req.target_email)
        .bind(expires_at)
        .execute(&state.db)
        .await?;

        invites.push(serde_json::json!({
            "id": id,
            "code": code,
            "expires_at": expires_at,
        }));
    }

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "invites": invites }))))
}

/// List invites for this attestor.
pub async fn list_invites(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<impl IntoResponse> {
    let attestor = get_user_attestor(&state.db, auth_user.user_id).await?;

    let invites = sqlx::query_as::<_, Invite>(
        "SELECT * FROM invites WHERE attestor_id = $1 ORDER BY created_at DESC",
    )
    .bind(attestor.id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "invites": invites })))
}

/// Validate an invite code (public, pre-auth).
pub async fn validate_invite(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> AppResult<impl IntoResponse> {
    let invite = sqlx::query_as::<_, Invite>(
        "SELECT * FROM invites WHERE code = $1",
    )
    .bind(&code)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Invite not found".into()))?;

    let valid = invite.claimed_by.is_none() && invite.expires_at > Utc::now();

    Ok(Json(serde_json::json!({
        "valid": valid,
        "expires_at": invite.expires_at,
        "target_email": invite.target_email,
    })))
}

/// Helper: find the attestor associated with a user.
/// For MVP, we check if the user's email matches the attestor's contact_email.
async fn get_user_attestor(
    db: &sqlx::PgPool,
    user_id: Uuid,
) -> AppResult<Attestor> {
    let user_email: String = sqlx::query_scalar(
        "SELECT email FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;

    let attestor = sqlx::query_as::<_, Attestor>(
        "SELECT * FROM attestors WHERE contact_email = $1 AND status = 'active'",
    )
    .bind(&user_email)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::Forbidden("Not an attestor".into()))?;

    Ok(attestor)
}

fn generate_invite_code() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    (0..8).map(|_| chars[rng.random_range(0..chars.len())]).collect()
}
