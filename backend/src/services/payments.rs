use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::{AppError, AppResult};
use crate::models::payment::FeeBreakdown;

/// Create a payment record and Stripe PaymentIntent with manual capture.
/// Returns the PaymentIntent client_secret for frontend confirmation.
pub async fn create_escrow_payment(
    db: &PgPool,
    stripe_secret_key: &str,
    task_id: Uuid,
    requester_id: Uuid,
    doer_id: Uuid,
    task_price_cents: i64,
    requester_stripe_customer_id: &str,
) -> AppResult<(Uuid, String)> {
    let breakdown = FeeBreakdown::calculate(task_price_cents);

    let client = stripe::Client::new(stripe_secret_key);

    // Create PaymentIntent with manual capture (authorize only)
    let mut create_params =
        stripe::CreatePaymentIntent::new(breakdown.total_charged_cents, stripe::Currency::USD);
    create_params.capture_method = Some(stripe::PaymentIntentCaptureMethod::Manual);
    create_params.customer = Some(
        requester_stripe_customer_id
            .parse()
            .map_err(|_| AppError::PaymentError("Invalid Stripe customer ID".into()))?,
    );
    create_params.metadata = Some(
        [
            ("task_id".to_string(), task_id.to_string()),
            ("requester_id".to_string(), requester_id.to_string()),
            ("doer_id".to_string(), doer_id.to_string()),
        ]
        .into_iter()
        .collect(),
    );

    let payment_intent = stripe::PaymentIntent::create(&client, create_params)
        .await
        .map_err(|e| {
            AppError::PaymentError(format!("Stripe PaymentIntent creation failed: {e}"))
        })?;

    let payment_id = Uuid::now_v7();

    sqlx::query(
        r#"
        INSERT INTO payments
            (id, task_id, requester_id, doer_id, task_price_cents, gideon_fee_cents,
             stripe_fee_cents, total_charged_cents, doer_payout_cents,
             stripe_payment_intent_id, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', now())
        "#,
    )
    .bind(payment_id)
    .bind(task_id)
    .bind(requester_id)
    .bind(doer_id)
    .bind(breakdown.task_price_cents)
    .bind(breakdown.gideon_fee_cents)
    .bind(breakdown.stripe_fee_cents)
    .bind(breakdown.total_charged_cents)
    .bind(breakdown.doer_payout_cents)
    .bind(payment_intent.id.as_str())
    .execute(db)
    .await?;

    let client_secret = payment_intent
        .client_secret
        .ok_or_else(|| AppError::PaymentError("No client_secret on PaymentIntent".into()))?;

    Ok((payment_id, client_secret))
}

/// Capture an authorized PaymentIntent (transition from authorized → captured).
/// Called when the doer confirms start.
pub async fn capture_payment(db: &PgPool, stripe_secret_key: &str, task_id: Uuid) -> AppResult<()> {
    let payment: crate::models::payment::Payment =
        sqlx::query_as("SELECT * FROM payments WHERE task_id = $1")
            .bind(task_id)
            .fetch_optional(db)
            .await?
            .ok_or_else(|| AppError::NotFound("Payment not found".into()))?;

    let client = stripe::Client::new(stripe_secret_key);

    stripe::PaymentIntent::capture(
        &client,
        &payment.stripe_payment_intent_id,
        stripe::CapturePaymentIntent {
            ..Default::default()
        },
    )
    .await
    .map_err(|e| AppError::PaymentError(format!("Stripe capture failed: {e}")))?;

    sqlx::query("UPDATE payments SET status = 'escrowed', escrowed_at = now() WHERE task_id = $1")
        .bind(task_id)
        .execute(db)
        .await?;

    Ok(())
}

/// Release escrowed funds to the doer via Stripe Transfer.
/// Called when the requester approves completion.
pub async fn release_payment(db: &PgPool, stripe_secret_key: &str, task_id: Uuid) -> AppResult<()> {
    let payment: crate::models::payment::Payment =
        sqlx::query_as("SELECT * FROM payments WHERE task_id = $1")
            .bind(task_id)
            .fetch_optional(db)
            .await?
            .ok_or_else(|| AppError::NotFound("Payment not found".into()))?;

    // Get doer's Stripe Connect account
    let doer_connect_id: Option<String> =
        sqlx::query_scalar("SELECT stripe_connect_account_id FROM users WHERE id = $1")
            .bind(payment.doer_id)
            .fetch_optional(db)
            .await?
            .flatten();

    let doer_connect_id = doer_connect_id
        .ok_or_else(|| AppError::PaymentError("Doer has no Stripe Connect account".into()))?;

    let client = stripe::Client::new(stripe_secret_key);

    let mut transfer_params = stripe::CreateTransfer::new(stripe::Currency::USD, doer_connect_id);
    transfer_params.amount = Some(payment.doer_payout_cents);
    transfer_params.metadata = Some(
        [
            ("task_id".to_string(), task_id.to_string()),
            ("payment_id".to_string(), payment.id.to_string()),
        ]
        .into_iter()
        .collect(),
    );

    let transfer = stripe::Transfer::create(&client, transfer_params)
        .await
        .map_err(|e| AppError::PaymentError(format!("Stripe transfer failed: {e}")))?;

    sqlx::query(
        r#"
        UPDATE payments
        SET status = 'released', released_at = now(), stripe_transfer_id = $1
        WHERE task_id = $2
        "#,
    )
    .bind(transfer.id.as_str())
    .bind(task_id)
    .execute(db)
    .await?;

    Ok(())
}

/// Refund a payment (full refund of the PaymentIntent).
/// Gideon absorbs its own fee on refunds.
pub async fn refund_payment(db: &PgPool, stripe_secret_key: &str, task_id: Uuid) -> AppResult<()> {
    let payment: crate::models::payment::Payment =
        sqlx::query_as("SELECT * FROM payments WHERE task_id = $1")
            .bind(task_id)
            .fetch_optional(db)
            .await?
            .ok_or_else(|| AppError::NotFound("Payment not found".into()))?;

    let client = stripe::Client::new(stripe_secret_key);

    // If payment was only authorized (not captured), cancel the PaymentIntent
    if payment.status == "pending" {
        stripe::PaymentIntent::cancel(
            &client,
            &payment.stripe_payment_intent_id,
            stripe::CancelPaymentIntent {
                ..Default::default()
            },
        )
        .await
        .map_err(|e| AppError::PaymentError(format!("Stripe cancel failed: {e}")))?;
    } else {
        // Payment was captured — issue a refund
        let refund_params = stripe::CreateRefund {
            payment_intent: Some(
                payment
                    .stripe_payment_intent_id
                    .parse()
                    .map_err(|_| AppError::PaymentError("Invalid PaymentIntent ID".into()))?,
            ),
            ..Default::default()
        };

        stripe::Refund::create(&client, refund_params)
            .await
            .map_err(|e| AppError::PaymentError(format!("Stripe refund failed: {e}")))?;
    }

    sqlx::query("UPDATE payments SET status = 'refunded', refunded_at = now() WHERE task_id = $1")
        .bind(task_id)
        .execute(db)
        .await?;

    Ok(())
}
