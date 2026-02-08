use axum::{
    Json,
    extract::{Path, State},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::middleware::{AppState, AuthUser};
use crate::errors::{AppError, AppResult};
use crate::models::reputation::ReputationSummary;
use crate::models::user::{PublicUserProfile, User};

#[derive(Debug, Serialize)]
pub struct UserProfileResponse {
    pub user: User,
}

pub async fn get_me(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<impl IntoResponse> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(auth_user.user_id)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(user))
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub legal_first_name: Option<String>,
    pub legal_last_name: Option<String>,
    pub phone: Option<String>,
}

pub async fn update_me(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(req): Json<UpdateProfileRequest>,
) -> AppResult<impl IntoResponse> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(auth_user.user_id)
        .fetch_one(&state.db)
        .await?;

    let first_name = req.legal_first_name.unwrap_or(user.legal_first_name);
    let last_name = req.legal_last_name.unwrap_or(user.legal_last_name);
    let phone = req.phone.unwrap_or(user.phone);

    sqlx::query(
        r#"
        UPDATE users
        SET legal_first_name = $1, legal_last_name = $2, phone = $3, updated_at = now()
        WHERE id = $4
        "#,
    )
    .bind(&first_name)
    .bind(&last_name)
    .bind(&phone)
    .bind(auth_user.user_id)
    .execute(&state.db)
    .await?;

    let updated = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(auth_user.user_id)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(updated))
}

#[derive(Debug, Serialize)]
pub struct PublicProfileResponse {
    pub user: PublicUserProfile,
    pub reputation: Option<ReputationSummary>,
}

pub async fn get_user_profile(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    let reputation = sqlx::query_as::<_, ReputationSummary>(
        "SELECT * FROM reputation_summary WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(PublicProfileResponse {
        user: PublicUserProfile::from(&user),
        reputation,
    }))
}

#[derive(Debug, Serialize)]
pub struct StripeConnectResponse {
    pub url: String,
}

pub async fn initiate_stripe_connect(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<StripeConnectResponse>> {
    let client = stripe::Client::new(&state.config.stripe_secret_key);

    // Create Connect Express account
    let mut params = stripe::CreateAccount::default();
    params.type_ = Some(stripe::AccountType::Express);
    params.country = Some("US");
    params.capabilities = Some(stripe::CreateAccountCapabilities {
        transfers: Some(stripe::CreateAccountCapabilitiesTransfers {
            requested: Some(true),
        }),
        ..Default::default()
    });

    let account = stripe::Account::create(&client, params)
        .await
        .map_err(|e| AppError::PaymentError(format!("Stripe account creation failed: {e}")))?;

    // Save account ID
    sqlx::query(
        "UPDATE users SET stripe_connect_account_id = $1, updated_at = now() WHERE id = $2",
    )
    .bind(account.id.as_str())
    .bind(auth_user.user_id)
    .execute(&state.db)
    .await?;

    // Create account link for onboarding
    let return_url = format!("{}/stripe/return", state.config.base_url);
    let refresh_url = format!("{}/stripe/refresh", state.config.base_url);
    let mut link_params = stripe::CreateAccountLink::new(
        account.id,
        stripe::AccountLinkType::AccountOnboarding,
    );
    link_params.return_url = Some(&return_url);
    link_params.refresh_url = Some(&refresh_url);

    let link = stripe::AccountLink::create(&client, link_params)
        .await
        .map_err(|e| AppError::PaymentError(format!("Stripe account link failed: {e}")))?;

    Ok(Json(StripeConnectResponse { url: link.url }))
}

pub async fn stripe_connect_status(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let connect_id: Option<String> = sqlx::query_scalar(
        "SELECT stripe_connect_account_id FROM users WHERE id = $1",
    )
    .bind(auth_user.user_id)
    .fetch_one(&state.db)
    .await?;

    match connect_id {
        Some(id) => {
            let client = stripe::Client::new(&state.config.stripe_secret_key);
            let account_id: stripe::AccountId = id.parse().map_err(|_| {
                AppError::Internal("Invalid Stripe account ID stored".into())
            })?;
            let account = stripe::Account::retrieve(&client, &account_id, &[])
                .await
                .map_err(|e| AppError::PaymentError(format!("Stripe account fetch failed: {e}")))?;

            Ok(Json(serde_json::json!({
                "connected": true,
                "charges_enabled": account.charges_enabled,
                "payouts_enabled": account.payouts_enabled,
            })))
        }
        None => Ok(Json(serde_json::json!({
            "connected": false,
        }))),
    }
}
