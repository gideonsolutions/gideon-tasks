use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::jwt::{
    create_access_token, generate_refresh_token, hash_refresh_token,
};
use crate::auth::middleware::{AppState, AuthUser};
use crate::auth::password::{hash_password, verify_password};
use crate::errors::{AppError, AppResult};
use crate::services::audit::log_audit;

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub invite_code: String,
    pub legal_first_name: String,
    pub legal_last_name: String,
    pub email: String,
    pub phone: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    pub user_id: Uuid,
    pub message: String,
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate invite code
    let invite = sqlx::query_as::<_, crate::models::invite::Invite>(
        "SELECT * FROM invites WHERE code = $1 AND claimed_by IS NULL AND expires_at > now()",
    )
    .bind(&req.invite_code)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("Invalid or expired invite code".into()))?;

    // Check targeted invite email matches (if set)
    if let Some(ref target_email) = invite.target_email {
        if target_email != &req.email {
            return Err(AppError::BadRequest(
                "This invite was issued for a different email address".into(),
            ));
        }
    }

    // Check email uniqueness
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM users WHERE email = $1",
    )
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await?;
    if existing.is_some() {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    // Check phone uniqueness
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM users WHERE phone = $1",
    )
    .bind(&req.phone)
    .fetch_optional(&state.db)
    .await?;
    if existing.is_some() {
        return Err(AppError::Conflict("Phone already registered".into()));
    }

    // Validate password strength (basic check)
    if req.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".into(),
        ));
    }

    let password_hash = hash_password(&req.password)?;
    let user_id = Uuid::now_v7();

    // Create user
    sqlx::query(
        r#"
        INSERT INTO users (id, email, phone, legal_first_name, legal_last_name, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, now(), now())
        "#,
    )
    .bind(user_id)
    .bind(&req.email)
    .bind(&req.phone)
    .bind(&req.legal_first_name)
    .bind(&req.legal_last_name)
    .bind(&password_hash)
    .execute(&state.db)
    .await?;

    // Claim invite
    sqlx::query("UPDATE invites SET claimed_by = $1 WHERE id = $2")
        .bind(user_id)
        .bind(invite.id)
        .execute(&state.db)
        .await?;

    // Create pending attestation
    let attestation_id = Uuid::now_v7();
    sqlx::query(
        r#"
        INSERT INTO attestations (id, attestor_id, user_id, status, created_at)
        VALUES ($1, $2, $3, 'pending', now())
        "#,
    )
    .bind(attestation_id)
    .bind(invite.attestor_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    // Initialize reputation summary
    sqlx::query(
        "INSERT INTO reputation_summary (user_id, updated_at) VALUES ($1, now())",
    )
    .bind(user_id)
    .execute(&state.db)
    .await?;

    log_audit(
        &state.db,
        Some(user_id),
        "user.registered",
        "user",
        user_id,
        None,
        Some(serde_json::json!({ "email": &req.email })),
        None,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(RegisterResponse {
            user_id,
            message: "Account created. Please verify your email and phone.".into(),
        }),
    ))
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailRequest {
    pub user_id: Uuid,
    pub code: String,
}

/// Email verification endpoint. In MVP, accepts any 6-digit code for the
/// corresponding user (actual email sending is out of scope for MVP backend).
pub async fn verify_email(
    State(state): State<AppState>,
    Json(req): Json<VerifyEmailRequest>,
) -> AppResult<impl IntoResponse> {
    // For MVP, we accept verification codes directly.
    // In production, this would validate against a code sent via email.
    if req.code.len() != 6 || !req.code.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::BadRequest("Invalid verification code".into()));
    }

    sqlx::query("UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1")
        .bind(req.user_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(req.user_id),
        "user.email_verified",
        "user",
        req.user_id,
        None,
        None,
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Email verified" })))
}

#[derive(Debug, Deserialize)]
pub struct VerifyPhoneRequest {
    pub user_id: Uuid,
    pub code: String,
}

/// Phone verification endpoint. Same MVP caveat as email verification.
pub async fn verify_phone(
    State(state): State<AppState>,
    Json(req): Json<VerifyPhoneRequest>,
) -> AppResult<impl IntoResponse> {
    if req.code.len() != 6 || !req.code.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::BadRequest("Invalid verification code".into()));
    }

    sqlx::query("UPDATE users SET phone_verified = true, updated_at = now() WHERE id = $1")
        .bind(req.user_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(req.user_id),
        "user.phone_verified",
        "user",
        req.user_id,
        None,
        None,
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Phone verified" })))
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: Uuid,
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<impl IntoResponse> {
    let user = sqlx::query_as::<_, crate::models::user::User>(
        "SELECT * FROM users WHERE email = $1",
    )
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid email or password".into()))?;

    // Check user status
    if user.status != "active" {
        return Err(AppError::Forbidden(format!(
            "Account is {}",
            user.status
        )));
    }

    // Verify password
    if !verify_password(&req.password, &user.password_hash)? {
        return Err(AppError::Unauthorized("Invalid email or password".into()));
    }

    // Create access token
    let access_token = create_access_token(
        user.id,
        user.is_admin,
        user.trust_level,
        &state.config.jwt_secret,
        state.config.jwt_access_expiry_secs,
    )?;

    // Create refresh token
    let refresh_token = generate_refresh_token();
    let token_hash = hash_refresh_token(&refresh_token);
    let refresh_id = Uuid::now_v7();
    let expires_at = Utc::now() + Duration::seconds(state.config.jwt_refresh_expiry_secs);

    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
        VALUES ($1, $2, $3, $4, now())
        "#,
    )
    .bind(refresh_id)
    .bind(user.id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    log_audit(
        &state.db,
        Some(user.id),
        "user.login",
        "user",
        user.id,
        None,
        None,
        None,
    )
    .await?;

    Ok(Json(LoginResponse {
        access_token,
        refresh_token,
        user_id: user.id,
    }))
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshRequest>,
) -> AppResult<impl IntoResponse> {
    let token_hash = hash_refresh_token(&req.refresh_token);

    // Find and validate refresh token
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        r#"
        SELECT rt.id, rt.user_id
        FROM refresh_tokens rt
        WHERE rt.token_hash = $1 AND rt.expires_at > now()
        "#,
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await?;

    let (token_id, user_id) =
        row.ok_or_else(|| AppError::Unauthorized("Invalid or expired refresh token".into()))?;

    // Delete old refresh token (rotate)
    sqlx::query("DELETE FROM refresh_tokens WHERE id = $1")
        .bind(token_id)
        .execute(&state.db)
        .await?;

    // Fetch current user data
    let user = sqlx::query_as::<_, crate::models::user::User>(
        "SELECT * FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    if user.status != "active" {
        return Err(AppError::Forbidden(format!(
            "Account is {}",
            user.status
        )));
    }

    // Issue new tokens
    let access_token = create_access_token(
        user.id,
        user.is_admin,
        user.trust_level,
        &state.config.jwt_secret,
        state.config.jwt_access_expiry_secs,
    )?;

    let new_refresh_token = generate_refresh_token();
    let new_hash = hash_refresh_token(&new_refresh_token);
    let new_refresh_id = Uuid::now_v7();
    let expires_at = Utc::now() + Duration::seconds(state.config.jwt_refresh_expiry_secs);

    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
        VALUES ($1, $2, $3, $4, now())
        "#,
    )
    .bind(new_refresh_id)
    .bind(user.id)
    .bind(&new_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    Ok(Json(LoginResponse {
        access_token,
        refresh_token: new_refresh_token,
        user_id: user.id,
    }))
}

pub async fn logout(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<impl IntoResponse> {
    // Delete all refresh tokens for this user
    sqlx::query("DELETE FROM refresh_tokens WHERE user_id = $1")
        .bind(auth_user.user_id)
        .execute(&state.db)
        .await?;

    log_audit(
        &state.db,
        Some(auth_user.user_id),
        "user.logout",
        "user",
        auth_user.user_id,
        None,
        None,
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Logged out" })))
}
