//! Review model with four-dimensional reputation scoring.
//!
//! No single star rating. Four separate dimensions, each scored 1-5:
//! - **Reliability**: Showed up, completed on time, didn't cancel
//! - **Quality**: Work met expectations and description
//! - **Communication**: Responsive, clear, professional
//! - **Integrity**: Honest, no disputes, followed platform rules
//!
//! Reviews are permanent and public. No edits, no deletions.
//! Both parties have 7 days after completion to leave a review.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Review {
    pub id: Uuid,
    pub task_id: Uuid,
    pub reviewer_id: Uuid,
    pub reviewee_id: Uuid,
    pub reliability: i16,
    pub quality: i16,
    pub communication: i16,
    pub integrity: i16,
    pub comment: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReviewRequest {
    pub reliability: i16,
    pub quality: i16,
    pub communication: i16,
    pub integrity: i16,
    pub comment: Option<String>,
}

impl CreateReviewRequest {
    pub fn validate(&self) -> Result<(), String> {
        for (name, val) in [
            ("reliability", self.reliability),
            ("quality", self.quality),
            ("communication", self.communication),
            ("integrity", self.integrity),
        ] {
            if !(1..=5).contains(&val) {
                return Err(format!("{name} must be between 1 and 5"));
            }
        }
        Ok(())
    }

    /// A review is "positive" if all dimensions are >= 3.
    pub fn is_positive(&self) -> bool {
        self.reliability >= 3 && self.quality >= 3 && self.communication >= 3 && self.integrity >= 3
    }
}
