use axum::{
    extract::FromRequestParts,
    http::{HeaderMap, request::Parts},
};
use std::sync::Arc;

use crate::auth::jwt::{Claims, decode_access_token};
use crate::config::AppConfig;
use crate::errors::AppError;

/// Authenticated user claims, extracted from the JWT Bearer token.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: uuid::Uuid,
    pub is_admin: bool,
    pub trust_level: i16,
}

/// Application state shared across handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub config: Arc<AppConfig>,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer_token(&parts.headers)?;
        let token_data = decode_access_token(&token, &state.config.jwt_secret)?;
        let claims: Claims = token_data.claims;

        Ok(AuthUser {
            user_id: claims.sub,
            is_admin: claims.is_admin,
            trust_level: claims.trust_level,
        })
    }
}

/// Extract Bearer token from Authorization header.
fn extract_bearer_token(headers: &HeaderMap) -> Result<String, AppError> {
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

    if !auth_header.starts_with("Bearer ") {
        return Err(AppError::Unauthorized(
            "Invalid Authorization header format".into(),
        ));
    }

    Ok(auth_header[7..].to_string())
}

/// Admin-only guard. Use as an extractor after AuthUser.
#[derive(Debug, Clone)]
pub struct AdminUser(pub AuthUser);

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_user = AuthUser::from_request_parts(parts, state).await?;
        if !auth_user.is_admin {
            return Err(AppError::Forbidden("Admin access required".into()));
        }
        Ok(AdminUser(auth_user))
    }
}
