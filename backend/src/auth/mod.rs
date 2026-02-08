//! Authentication and authorization.
//!
//! - [`jwt`] — JWT access token creation/verification, refresh token generation
//! - [`middleware`] — Axum extractors for authenticated and admin users
//! - [`password`] — Argon2 password hashing and verification

pub mod jwt;
pub mod middleware;
pub mod password;
