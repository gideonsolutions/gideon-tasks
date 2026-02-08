use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Attestation {
    pub id: Uuid,
    pub attestor_id: Uuid,
    pub user_id: Uuid,
    pub status: String,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Attestor {
    pub id: Uuid,
    pub name: String,
    pub r#type: String,
    pub status: String,
    pub invite_quota: i32,
    pub contact_email: Option<String>,
    pub created_at: DateTime<Utc>,
}
