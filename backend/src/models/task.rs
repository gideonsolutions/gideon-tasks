//! Task domain model and state machine.
//!
//! The task state machine enforces all allowed transitions. No other transitions
//! are permitted. Terminal states (`Completed`, `Resolved`, `Cancelled`, `Expired`,
//! `Rejected`) allow no further transitions.
//!
//! ```text
//! DRAFT -> PENDING_REVIEW -> PUBLISHED -> ASSIGNED -> IN_PROGRESS -> SUBMITTED -> COMPLETED
//!               |                |            |                          |
//!               v                v            v                          v
//!           REJECTED          EXPIRED    CANCELLED                   DISPUTED -> RESOLVED
//! ```

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::errors::AppError;

/// Task statuses — enforced at the type level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Draft,
    PendingReview,
    Published,
    Assigned,
    InProgress,
    Submitted,
    Completed,
    Disputed,
    Resolved,
    Cancelled,
    Expired,
    Rejected,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::PendingReview => "pending_review",
            Self::Published => "published",
            Self::Assigned => "assigned",
            Self::InProgress => "in_progress",
            Self::Submitted => "submitted",
            Self::Completed => "completed",
            Self::Disputed => "disputed",
            Self::Resolved => "resolved",
            Self::Cancelled => "cancelled",
            Self::Expired => "expired",
            Self::Rejected => "rejected",
        }
    }

    /// Is this a terminal state?
    #[allow(dead_code)]
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Resolved | Self::Cancelled | Self::Expired | Self::Rejected
        )
    }

    /// Validate a state transition. Returns the target state or an error.
    /// This is the single source of truth for allowed transitions.
    pub fn transition_to(self, target: TaskStatus) -> Result<TaskStatus, AppError> {
        let allowed = match self {
            Self::Draft => matches!(target, Self::PendingReview),
            Self::PendingReview => matches!(target, Self::Published | Self::Rejected),
            Self::Published => {
                matches!(target, Self::Assigned | Self::Cancelled | Self::Expired)
            }
            Self::Assigned => matches!(target, Self::InProgress | Self::Cancelled),
            Self::InProgress => matches!(target, Self::Submitted),
            Self::Submitted => matches!(target, Self::Completed | Self::Disputed),
            Self::Disputed => matches!(target, Self::Resolved),
            // Terminal states allow no transitions
            Self::Completed | Self::Resolved | Self::Cancelled | Self::Expired | Self::Rejected => {
                false
            }
        };

        if allowed {
            Ok(target)
        } else {
            Err(AppError::InvalidTransition(format!(
                "Cannot transition from {} to {}",
                self.as_str(),
                target.as_str()
            )))
        }
    }
}

impl std::str::FromStr for TaskStatus {
    type Err = ();
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "draft" => Ok(Self::Draft),
            "pending_review" => Ok(Self::PendingReview),
            "published" => Ok(Self::Published),
            "assigned" => Ok(Self::Assigned),
            "in_progress" => Ok(Self::InProgress),
            "submitted" => Ok(Self::Submitted),
            "completed" => Ok(Self::Completed),
            "disputed" => Ok(Self::Disputed),
            "resolved" => Ok(Self::Resolved),
            "cancelled" => Ok(Self::Cancelled),
            "expired" => Ok(Self::Expired),
            "rejected" => Ok(Self::Rejected),
            _ => Err(()),
        }
    }
}

/// Location type for tasks.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocationType {
    InPerson,
    Remote,
}

#[allow(dead_code)]
impl LocationType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InPerson => "in_person",
            Self::Remote => "remote",
        }
    }
}

impl std::str::FromStr for LocationType {
    type Err = ();
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "in_person" => Ok(Self::InPerson),
            "remote" => Ok(Self::Remote),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Task {
    pub id: Uuid,
    pub requester_id: Uuid,
    pub title: String,
    pub description: String,
    pub category_id: Uuid,
    pub location_type: String,
    pub location_address: Option<String>,
    pub location_lat: Option<f64>,
    pub location_lng: Option<f64>,
    pub price_cents: i64,
    pub status: String,
    pub deadline: DateTime<Utc>,
    pub assigned_doer_id: Option<Uuid>,
    pub moderation_note: Option<String>,
    pub rejection_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Task {
    #[allow(dead_code)]
    pub fn parsed_status(&self) -> Option<TaskStatus> {
        self.status.parse().ok()
    }
}

/// Minimum task price: $5.00 = 500 cents.
pub const MIN_TASK_PRICE_CENTS: i64 = 500;
