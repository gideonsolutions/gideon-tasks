//! Business logic services.
//!
//! - [`audit`] — Append-only audit and moderation logging
//! - [`moderation`] — Content moderation pipeline (blocklist + pattern matching)
//! - [`payments`] — Stripe Connect escrow, capture, transfer, and refund
//! - [`reputation`] — User reputation summary recomputation
//! - [`trust`] — Trust level calculation and updates

pub mod audit;
pub mod moderation;
pub mod payments;
pub mod reputation;
pub mod trust;
