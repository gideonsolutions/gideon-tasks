//! Payment model and fee calculation.
//!
//! ## Fee Structure
//!
//! Two separate fees — never conflated:
//!
//! - **Gideon fee**: Exactly 1% of the task price. Hard-coded constant.
//! - **Stripe fee**: Set by Stripe (~2.9% + $0.30). Recorded after charge.
//!
//! The requester pays `task_price + gideon_fee + stripe_fee`.
//! The doer receives `task_price - gideon_fee`.
//!
//! Gideon absorbs its own fee on refunds.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use uuid::Uuid;

/// Gideon platform fee. Hard-coded. Never increases.
/// To reduce this value, change this constant and deploy.
const GIDEON_FEE_BPS: u64 = 100; // 100 basis points = 1%

/// Stripe's approximate fee rate (2.9% + $0.30). Recorded for transparency.
/// These are not controlled by Gideon and may change at Stripe's discretion.
const STRIPE_RATE_BPS: u64 = 290; // 2.9% = 290 basis points
const STRIPE_FIXED_CENTS: u64 = 30;

/// Payment status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaymentStatus {
    Pending,
    Escrowed,
    Released,
    Refunded,
    Failed,
}

impl PaymentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Escrowed => "escrowed",
            Self::Released => "released",
            Self::Refunded => "refunded",
            Self::Failed => "failed",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(Self::Pending),
            "escrowed" => Some(Self::Escrowed),
            "released" => Some(Self::Released),
            "refunded" => Some(Self::Refunded),
            "failed" => Some(Self::Failed),
            _ => None,
        }
    }
}

/// Fee calculation result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FeeBreakdown {
    pub task_price_cents: i64,
    pub gideon_fee_cents: i64,
    pub doer_payout_cents: i64,
    pub stripe_fee_cents: i64,
    pub total_charged_cents: i64,
}

impl FeeBreakdown {
    /// Calculate the full fee breakdown for a given task price.
    ///
    /// gideon_fee_cents   = task_price_cents / 100  (integer division, rounds DOWN — favor user)
    /// doer_payout_cents  = task_price_cents - gideon_fee_cents
    /// subtotal_cents     = task_price_cents + gideon_fee_cents
    /// total_charged_cents = ceil((subtotal_cents + 30) / (1 - 0.029))
    /// stripe_fee_cents    = total_charged_cents - subtotal_cents
    pub fn calculate(task_price_cents: i64) -> Self {
        let price = task_price_cents as u64;

        // Gideon fee: exactly 1%, integer division rounds down (favors user)
        let gideon_fee = price * GIDEON_FEE_BPS / 10_000;
        let doer_payout = price - gideon_fee;
        let subtotal = price + gideon_fee;

        // Stripe fee: reverse-engineer the total so Stripe takes its cut and
        // Gideon + doer receive exact amounts.
        // total = ceil((subtotal + 30) / (1 - 0.029))
        // 1 - 0.029 = 0.971 → we use integer math: multiply by 10000, divide by 9710
        let numerator = (subtotal + STRIPE_FIXED_CENTS) * 10_000;
        let total_charged = (numerator + 9_710 - 1) / 9_710; // ceiling division
        let stripe_fee = total_charged - subtotal;

        Self {
            task_price_cents: price as i64,
            gideon_fee_cents: gideon_fee as i64,
            doer_payout_cents: doer_payout as i64,
            stripe_fee_cents: stripe_fee as i64,
            total_charged_cents: total_charged as i64,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Payment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub requester_id: Uuid,
    pub doer_id: Uuid,
    pub task_price_cents: i64,
    pub gideon_fee_cents: i64,
    pub stripe_fee_cents: i64,
    pub total_charged_cents: i64,
    pub doer_payout_cents: i64,
    pub stripe_payment_intent_id: String,
    pub stripe_transfer_id: Option<String>,
    pub status: String,
    pub escrowed_at: Option<DateTime<Utc>>,
    pub released_at: Option<DateTime<Utc>>,
    pub refunded_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fee_calculation_100_dollars() {
        let breakdown = FeeBreakdown::calculate(10_000); // $100.00
        assert_eq!(breakdown.task_price_cents, 10_000);
        assert_eq!(breakdown.gideon_fee_cents, 100); // 1% = $1.00
        assert_eq!(breakdown.doer_payout_cents, 9_900); // $99.00
        // subtotal = 10_100
        // total = ceil((10_100 + 30) * 10000 / 9710) = ceil(101300000 / 9710) = ceil(10432.5) = 10433
        assert_eq!(breakdown.total_charged_cents, 10_433);
        assert_eq!(breakdown.stripe_fee_cents, 333); // ~$3.33
    }

    #[test]
    fn test_fee_calculation_minimum_price() {
        let breakdown = FeeBreakdown::calculate(500); // $5.00
        assert_eq!(breakdown.task_price_cents, 500);
        assert_eq!(breakdown.gideon_fee_cents, 5); // 1% = $0.05
        assert_eq!(breakdown.doer_payout_cents, 495); // $4.95
        // subtotal = 505
        // total = ceil((505 + 30) * 10000 / 9710) = ceil(5350000 / 9710) = ceil(550.977) = 551
        assert_eq!(breakdown.total_charged_cents, 551);
        assert_eq!(breakdown.stripe_fee_cents, 46);
    }

    #[test]
    fn test_fee_calculation_gideon_fee_rounds_down() {
        // $7.77 = 777 cents. 1% = 7.77 → rounds down to 7.
        let breakdown = FeeBreakdown::calculate(777);
        assert_eq!(breakdown.gideon_fee_cents, 7);
        assert_eq!(breakdown.doer_payout_cents, 770);
    }

    #[test]
    fn test_fee_calculation_total_covers_all_fees() {
        for price in [500, 777, 1000, 5000, 10_000, 50_000, 100_000, 500_000] {
            let b = FeeBreakdown::calculate(price);
            // total_charged must equal subtotal + stripe_fee
            assert_eq!(
                b.total_charged_cents,
                b.task_price_cents + b.gideon_fee_cents + b.stripe_fee_cents,
                "Fee invariant violated for price_cents={}",
                price
            );
            // doer_payout + gideon_fee must equal task_price
            assert_eq!(
                b.doer_payout_cents + b.gideon_fee_cents,
                b.task_price_cents,
                "Payout invariant violated for price_cents={}",
                price
            );
        }
    }
}
