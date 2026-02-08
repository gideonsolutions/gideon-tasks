//! # Gideon Tasks API
//!
//! Private, invite-only task marketplace API for the Carolinas (US).
//!
//! ## Architecture
//!
//! - **Framework**: Axum web framework with tower middleware
//! - **Database**: PostgreSQL via SQLx (compile-time unchecked queries)
//! - **Payments**: Stripe Connect (Express accounts) for escrow and payouts
//! - **Auth**: JWT access tokens + rotating refresh tokens, Argon2 password hashing
//!
//! ## Core Concepts
//!
//! - **Tasks** follow a strict state machine (`Draft` -> `Published` -> `Assigned` ->
//!   `InProgress` -> `Submitted` -> `Completed`). Invalid transitions are rejected.
//! - **Trust Levels** (0-3) are computed from actual user data (completed tasks, reviews,
//!   account age) and gate what actions a user can perform.
//! - **Content Moderation** runs on task creation and messaging. Content is auto-rejected,
//!   flagged for manual review, or approved based on pattern matching.
//! - **Payments** use Stripe Connect with manual capture: authorize on assignment,
//!   capture on doer start, transfer on approval.
//! - **Audit Log** is append-only. All financial and state-changing actions are logged
//!   immutably.
//!
//! ## Fee Structure
//!
//! Gideon charges exactly 1% of the task price (hard-coded constant, rounds down).
//! Stripe's processing fee (~2.9% + $0.30) is passed through to the requester.
//! The doer receives `task_price - gideon_fee`.
//!
//! ## License
//!
//! Licensed under the Gideon Christian Open Source License (GCOSL) v1.0.

pub mod auth;
pub mod config;
pub mod errors;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod services;
