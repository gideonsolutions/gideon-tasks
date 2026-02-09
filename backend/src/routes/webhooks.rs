use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::auth::middleware::AppState;
use crate::errors::{AppError, AppResult};

type HmacSha256 = Hmac<Sha256>;

/// Handle inbound Stripe webhooks.
/// Verifies webhook signature, then processes events.
pub async fn handle_stripe_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<impl IntoResponse> {
    // Verify Stripe webhook signature
    let sig_header = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::BadRequest("Missing Stripe-Signature header".into()))?;

    verify_stripe_signature(&body, sig_header, &state.config.stripe_webhook_secret)?;

    // Parse event
    let event: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {e}")))?;

    let event_type = event["type"].as_str().unwrap_or("unknown");

    tracing::info!("Stripe webhook received: {}", event_type);

    match event_type {
        "payment_intent.succeeded" => {
            // Payment captured successfully
            if let Some(pi_id) = event["data"]["object"]["id"].as_str() {
                sqlx::query(
                    "UPDATE payments SET status = 'escrowed', escrowed_at = now() WHERE stripe_payment_intent_id = $1 AND status = 'pending'",
                )
                .bind(pi_id)
                .execute(&state.db)
                .await?;
            }
        }
        "payment_intent.payment_failed" => {
            if let Some(pi_id) = event["data"]["object"]["id"].as_str() {
                sqlx::query(
                    "UPDATE payments SET status = 'failed' WHERE stripe_payment_intent_id = $1",
                )
                .bind(pi_id)
                .execute(&state.db)
                .await?;
            }
        }
        "transfer.created" | "transfer.paid" => {
            // Transfer to doer succeeded
            if let Some(transfer_id) = event["data"]["object"]["id"].as_str() {
                sqlx::query(
                    "UPDATE payments SET status = 'released', released_at = now() WHERE stripe_transfer_id = $1",
                )
                .bind(transfer_id)
                .execute(&state.db)
                .await?;
            }
        }
        "account.updated" => {
            // Connect account status change
            if let Some(account_id) = event["data"]["object"]["id"].as_str() {
                let charges_enabled = event["data"]["object"]["charges_enabled"]
                    .as_bool()
                    .unwrap_or(false);
                let payouts_enabled = event["data"]["object"]["payouts_enabled"]
                    .as_bool()
                    .unwrap_or(false);

                tracing::info!(
                    "Connect account {} updated: charges={}, payouts={}",
                    account_id,
                    charges_enabled,
                    payouts_enabled
                );
            }
        }
        _ => {
            tracing::debug!("Unhandled Stripe event type: {}", event_type);
        }
    }

    Ok(StatusCode::OK)
}

/// Verify Stripe webhook signature using HMAC-SHA256.
fn verify_stripe_signature(payload: &[u8], sig_header: &str, secret: &str) -> AppResult<()> {
    // Parse sig header: t=timestamp,v1=signature
    let mut timestamp = None;
    let mut signatures = Vec::new();

    for part in sig_header.split(',') {
        let (key, value) = part
            .split_once('=')
            .ok_or_else(|| AppError::BadRequest("Malformed signature header".into()))?;
        match key {
            "t" => timestamp = Some(value),
            "v1" => signatures.push(value),
            _ => {}
        }
    }

    let timestamp =
        timestamp.ok_or_else(|| AppError::BadRequest("Missing timestamp in signature".into()))?;

    if signatures.is_empty() {
        return Err(AppError::BadRequest("Missing signature".into()));
    }

    // Compute expected signature
    let signed_payload = format!("{}.{}", timestamp, String::from_utf8_lossy(payload));
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|e| AppError::Internal(format!("HMAC error: {e}")))?;
    mac.update(signed_payload.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());

    // Constant-time comparison
    let valid = signatures.iter().any(|sig| {
        sig.len() == expected.len()
            && sig
                .bytes()
                .zip(expected.bytes())
                .fold(0u8, |acc, (a, b)| acc | (a ^ b))
                == 0
    });

    if !valid {
        return Err(AppError::BadRequest("Invalid webhook signature".into()));
    }

    Ok(())
}
