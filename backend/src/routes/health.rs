use axum::{Json, extract::State};
use serde_json::{Value, json};

use crate::auth::middleware::AppState;

pub async fn health_check(State(state): State<AppState>) -> Json<Value> {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await
        .is_ok();

    Json(json!({
        "status": if db_ok { "healthy" } else { "degraded" },
        "database": if db_ok { "ok" } else { "unreachable" },
    }))
}
