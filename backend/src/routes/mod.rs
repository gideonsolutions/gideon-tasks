//! HTTP route handlers organized by domain.
//!
//! All endpoints return JSON. Authentication via JWT Bearer token in the
//! `Authorization` header. Admin endpoints require `is_admin` claim in JWT.

pub mod admin;
pub mod applications;
pub mod attestations;
pub mod auth;
pub mod invites;
pub mod messages;
pub mod reviews;
pub mod tasks;
pub mod users;
pub mod webhooks;
