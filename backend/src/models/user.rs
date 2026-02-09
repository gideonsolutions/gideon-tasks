//! User model and trust level requirements.
//!
//! Trust levels are computed from actual user data, not manually assigned
//! (except Level 3 requires admin sign-off):
//!
//! | Level | Name | Requirements |
//! |-------|------|-------------|
//! | 0 | Verified | Registration complete |
//! | 1 | Established | 5+ completed, 0 disputes lost, age >= 30d |
//! | 2 | Trusted | 20+ completed, 0 unresolved disputes, age >= 90d, >= 90% positive |
//! | 3 | Pillar | 50+ completed, age >= 180d, >= 95% positive, admin-reviewed |

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[allow(dead_code)]
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, sqlx::Type,
)]
#[sqlx(type_name = "TEXT")]
#[serde(rename_all = "snake_case")]
pub enum UserStatus {
    Active,
    Suspended,
    Banned,
}

#[allow(dead_code)]
impl UserStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Suspended => "suspended",
            Self::Banned => "banned",
        }
    }
}

impl std::str::FromStr for UserStatus {
    type Err = ();
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "active" => Ok(Self::Active),
            "suspended" => Ok(Self::Suspended),
            "banned" => Ok(Self::Banned),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub phone: String,
    pub legal_first_name: String,
    pub legal_last_name: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub trust_level: i16,
    pub status: String,
    pub email_verified: bool,
    pub phone_verified: bool,
    pub stripe_customer_id: Option<String>,
    pub stripe_connect_account_id: Option<String>,
    pub id_verified_at: Option<DateTime<Utc>>,
    pub is_admin: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct PublicUserProfile {
    pub id: Uuid,
    pub legal_first_name: String,
    pub trust_level: i16,
    pub created_at: DateTime<Utc>,
}

impl From<&User> for PublicUserProfile {
    fn from(u: &User) -> Self {
        Self {
            id: u.id,
            legal_first_name: u.legal_first_name.clone(),
            trust_level: u.trust_level,
            created_at: u.created_at,
        }
    }
}

/// Trust level requirements — computed from actual data, not manually assigned.
pub struct TrustLevelRequirements;

impl TrustLevelRequirements {
    /// Maximum task value in cents for a given trust level.
    pub fn max_task_value_cents(level: i16) -> i64 {
        match level {
            0 => 10_000,  // $100
            1 => 50_000,  // $500
            2 => 200_000, // $2,000
            3 => 500_000, // $5,000
            _ => 0,
        }
    }

    /// Maximum concurrent tasks as doer.
    pub fn max_concurrent_doer(level: i16) -> i32 {
        match level {
            0 => 2,
            1 => 5,
            2 => 10,
            3 => 20,
            _ => 0,
        }
    }

    /// Maximum active tasks posted as requester. Level 0 cannot post.
    pub fn max_active_posted(level: i16) -> Option<i32> {
        match level {
            0 => None, // Cannot post
            1 => Some(2),
            2 => Some(10),
            3 => Some(25),
            _ => None,
        }
    }

    /// Can this trust level post tasks?
    pub fn can_post_tasks(level: i16) -> bool {
        level >= 1
    }

    /// Can this trust level apply for tasks?
    pub fn can_apply_for_tasks(level: i16) -> bool {
        level >= 0
    }
}
