use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, TokenData, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::errors::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid, // user ID
    pub is_admin: bool,
    pub trust_level: i16,
    pub exp: i64, // expiration timestamp
    pub iat: i64, // issued at
}

pub fn create_access_token(
    user_id: Uuid,
    is_admin: bool,
    trust_level: i16,
    secret: &str,
    expiry_secs: i64,
) -> AppResult<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id,
        is_admin,
        trust_level,
        exp: (now + Duration::seconds(expiry_secs)).timestamp(),
        iat: now.timestamp(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("JWT encoding failed: {e}")))
}

pub fn decode_access_token(token: &str, secret: &str) -> AppResult<TokenData<Claims>> {
    let mut validation = Validation::default();
    validation.set_required_spec_claims(&["sub", "exp"]);

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| AppError::Unauthorized(format!("Invalid token: {e}")))
}

/// Generate a cryptographically random refresh token.
pub fn generate_refresh_token() -> String {
    use rand::Rng;
    let bytes: [u8; 32] = rand::rng().random();
    hex::encode(bytes)
}

/// Hash a refresh token for storage.
pub fn hash_refresh_token(token: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}
