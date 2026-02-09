use axum::{
    Json,
    extract::{Path, State},
    response::IntoResponse,
};
use uuid::Uuid;

use crate::auth::middleware::{AppState, AuthUser};
use crate::errors::{AppError, AppResult};
use crate::models::attestation::{Attestation, Attestor};
use crate::services::audit::log_audit;

/// List pending attestations for this attestor.
pub async fn list_attestations(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<impl IntoResponse> {
    let attestor = get_user_attestor(&state.db, auth_user.user_id).await?;

    let attestations = sqlx::query_as::<_, Attestation>(
        "SELECT * FROM attestations WHERE attestor_id = $1 ORDER BY created_at DESC",
    )
    .bind(attestor.id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "attestations": attestations })))
}

/// Confirm a pending attestation.
pub async fn confirm_attestation(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(attestation_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let attestor = get_user_attestor(&state.db, auth_user.user_id).await?;

    let attestation = sqlx::query_as::<_, Attestation>(
        "SELECT * FROM attestations WHERE id = $1 AND attestor_id = $2",
    )
    .bind(attestation_id)
    .bind(attestor.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Attestation not found".into()))?;

    if attestation.status != "pending" {
        return Err(AppError::BadRequest(format!(
            "Attestation is already {}",
            attestation.status
        )));
    }

    sqlx::query("UPDATE attestations SET status = 'confirmed', confirmed_at = now() WHERE id = $1")
        .bind(attestation_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "attestation.confirmed",
        "attestation",
        attestation_id,
        None,
        Some(serde_json::json!({ "user_id": attestation.user_id })),
        None,
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Attestation confirmed" }),
    ))
}

/// Revoke an attestation.
pub async fn revoke_attestation(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(attestation_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let attestor = get_user_attestor(&state.db, auth_user.user_id).await?;

    let attestation = sqlx::query_as::<_, Attestation>(
        "SELECT * FROM attestations WHERE id = $1 AND attestor_id = $2",
    )
    .bind(attestation_id)
    .bind(attestor.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Attestation not found".into()))?;

    sqlx::query("UPDATE attestations SET status = 'revoked' WHERE id = $1")
        .bind(attestation_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "attestation.revoked",
        "attestation",
        attestation_id,
        None,
        Some(serde_json::json!({ "user_id": attestation.user_id })),
        None,
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Attestation revoked" }),
    ))
}

async fn get_user_attestor(db: &sqlx::PgPool, user_id: Uuid) -> AppResult<Attestor> {
    let user_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(db)
        .await?;

    sqlx::query_as::<_, Attestor>(
        "SELECT * FROM attestors WHERE contact_email = $1 AND status = 'active'",
    )
    .bind(&user_email)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::Forbidden("Not an attestor".into()))
}
