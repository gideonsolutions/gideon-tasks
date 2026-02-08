use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TaskApplication {
    pub id: Uuid,
    pub task_id: Uuid,
    pub doer_id: Uuid,
    pub message: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateApplicationRequest {
    pub message: Option<String>,
}
