use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// Simple in-memory rate limiter for MVP (single-server deployment).
/// For horizontal scaling, replace with Redis-based rate limiting.
#[derive(Clone)]
pub struct RateLimiter {
    inner: Arc<Mutex<RateLimiterInner>>,
}

struct RateLimiterInner {
    /// Map of (key) -> list of request timestamps
    requests: HashMap<String, Vec<Instant>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RateLimiterInner {
                requests: HashMap::new(),
            })),
        }
    }

    /// Check if a request is allowed under the given rate limit.
    /// Returns true if allowed, false if rate limited.
    pub async fn check(&self, key: &str, max_requests: u32, window: Duration) -> bool {
        let mut inner = self.inner.lock().await;
        let now = Instant::now();
        let cutoff = now - window;

        let timestamps = inner.requests.entry(key.to_string()).or_default();

        // Remove expired entries
        timestamps.retain(|t| *t > cutoff);

        if timestamps.len() >= max_requests as usize {
            false
        } else {
            timestamps.push(now);
            true
        }
    }

    /// Cleanup old entries to prevent memory leak. Call periodically.
    pub async fn cleanup(&self) {
        let mut inner = self.inner.lock().await;
        let now = Instant::now();
        // Remove entries older than 1 hour
        let cutoff = now - Duration::from_secs(3600);
        inner
            .requests
            .retain(|_, timestamps| timestamps.iter().any(|t| *t > cutoff));
    }
}

/// Rate limit configuration for different actions.
pub struct RateLimitConfig;

impl RateLimitConfig {
    /// Failed login attempts: 5 per 15 min
    pub const LOGIN_MAX: u32 = 5;
    pub const LOGIN_WINDOW: Duration = Duration::from_secs(15 * 60);

    /// Task applications (first 24h): 1 per hour
    pub const APPLICATION_NEW_USER_MAX: u32 = 1;
    /// Task applications (after 24h): 5 per hour
    pub const APPLICATION_ESTABLISHED_MAX: u32 = 5;
    pub const APPLICATION_WINDOW: Duration = Duration::from_secs(3600);

    /// Tasks posted per day: 3
    pub const TASK_POST_MAX: u32 = 3;
    pub const TASK_POST_WINDOW: Duration = Duration::from_secs(86400);

    /// Messages per hour (per task): 10
    pub const MESSAGE_MAX: u32 = 10;
    pub const MESSAGE_WINDOW: Duration = Duration::from_secs(3600);
}
