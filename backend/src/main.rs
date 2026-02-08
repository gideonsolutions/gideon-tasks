mod auth;
mod config;
mod errors;
mod middleware;
mod models;
mod routes;
mod services;

use axum::{Router, routing::{delete, get, post}};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::auth::middleware::AppState;
use crate::config::AppConfig;

#[tokio::main]
async fn main() {
    // Load .env file if present
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "gideon_tasks_api=info,tower_http=info".into()),
        )
        .init();

    let config = AppConfig::from_env();

    // Database connection pool
    let db = PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await
        .expect("Failed to connect to database");

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("Failed to run database migrations");

    tracing::info!("Database migrations applied");

    let state = AppState {
        db,
        config: Arc::new(config.clone()),
    };

    // Start rate limiter cleanup task
    let rate_limiter = crate::middleware::rate_limit::RateLimiter::new();
    let rl_clone = rate_limiter.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
            rl_clone.cleanup().await;
        }
    });

    let app = Router::new()
        // Auth routes
        .route("/auth/register", post(routes::auth::register))
        .route("/auth/verify-email", post(routes::auth::verify_email))
        .route("/auth/verify-phone", post(routes::auth::verify_phone))
        .route("/auth/login", post(routes::auth::login))
        .route("/auth/logout", post(routes::auth::logout))
        .route("/auth/refresh", post(routes::auth::refresh))
        // User routes
        .route("/users/me", get(routes::users::get_me).patch(routes::users::update_me))
        .route("/users/me/stripe-connect", post(routes::users::initiate_stripe_connect))
        .route("/users/me/stripe-connect/status", get(routes::users::stripe_connect_status))
        .route("/users/{id}", get(routes::users::get_user_profile))
        // Invite routes
        .route("/invites", post(routes::invites::create_invites).get(routes::invites::list_invites))
        .route("/invites/{code}", get(routes::invites::validate_invite))
        // Attestation routes
        .route("/attestations", get(routes::attestations::list_attestations))
        .route("/attestations/{id}/confirm", post(routes::attestations::confirm_attestation))
        .route("/attestations/{id}/revoke", post(routes::attestations::revoke_attestation))
        // Task routes
        .route("/tasks", post(routes::tasks::create_task).get(routes::tasks::list_tasks))
        .route("/tasks/{id}", get(routes::tasks::get_task).patch(routes::tasks::update_task))
        .route("/tasks/{id}/publish", post(routes::tasks::publish_task))
        .route("/tasks/{id}/cancel", post(routes::tasks::cancel_task))
        .route("/tasks/{id}/assign/{application_id}", post(routes::tasks::assign_task))
        .route("/tasks/{id}/start", post(routes::tasks::start_task))
        .route("/tasks/{id}/submit", post(routes::tasks::submit_task))
        .route("/tasks/{id}/approve", post(routes::tasks::approve_task))
        .route("/tasks/{id}/dispute", post(routes::tasks::dispute_task))
        // Application routes
        .route(
            "/tasks/{id}/applications",
            post(routes::applications::create_application)
                .get(routes::applications::list_applications),
        )
        .route(
            "/tasks/{id}/applications/mine",
            delete(routes::applications::withdraw_application),
        )
        // Message routes
        .route(
            "/tasks/{id}/messages",
            get(routes::messages::list_messages).post(routes::messages::send_message),
        )
        // Review routes
        .route("/tasks/{id}/reviews", post(routes::reviews::create_review))
        .route("/users/{id}/reviews", get(routes::reviews::list_user_reviews))
        // Admin routes
        .route("/admin/moderation", get(routes::admin::moderation_queue))
        .route("/admin/moderation/{id}/approve", post(routes::admin::approve_moderation))
        .route("/admin/moderation/{id}/reject", post(routes::admin::reject_moderation))
        .route("/admin/disputes", get(routes::admin::list_disputes))
        .route("/admin/disputes/{id}/resolve", post(routes::admin::resolve_dispute))
        .route("/admin/audit-log", get(routes::admin::query_audit_log))
        .route("/admin/users/{id}/suspend", post(routes::admin::suspend_user))
        .route("/admin/users/{id}/ban", post(routes::admin::ban_user))
        // Webhooks
        .route("/webhooks/stripe", post(routes::webhooks::handle_stripe_webhook))
        // Middleware
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    let addr = format!("{}:{}", config.server_host, config.server_port);
    tracing::info!("Starting Gideon Tasks API on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind address");

    axum::serve(listener, app)
        .await
        .expect("Server failed");
}
