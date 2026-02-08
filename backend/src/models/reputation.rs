use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ReputationSummary {
    pub user_id: Uuid,
    pub total_completed: i32,
    pub completion_rate: f32,
    pub on_time_rate: f32,
    pub avg_reliability: f32,
    pub avg_quality: f32,
    pub avg_communication: f32,
    pub avg_integrity: f32,
    pub disputes_lost: i32,
    pub positive_review_rate: f32,
    pub updated_at: DateTime<Utc>,
}
