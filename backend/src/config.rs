use std::env;

#[derive(Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_access_expiry_secs: i64,
    pub jwt_refresh_expiry_secs: i64,
    pub stripe_secret_key: String,
    pub stripe_webhook_secret: String,
    pub server_host: String,
    pub server_port: u16,
    pub base_url: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            jwt_secret: env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            jwt_access_expiry_secs: env::var("JWT_ACCESS_EXPIRY_SECS")
                .unwrap_or_else(|_| "900".into()) // 15 minutes
                .parse()
                .expect("JWT_ACCESS_EXPIRY_SECS must be a valid integer"),
            jwt_refresh_expiry_secs: env::var("JWT_REFRESH_EXPIRY_SECS")
                .unwrap_or_else(|_| "604800".into()) // 7 days
                .parse()
                .expect("JWT_REFRESH_EXPIRY_SECS must be a valid integer"),
            stripe_secret_key: env::var("STRIPE_SECRET_KEY")
                .expect("STRIPE_SECRET_KEY must be set"),
            stripe_webhook_secret: env::var("STRIPE_WEBHOOK_SECRET")
                .expect("STRIPE_WEBHOOK_SECRET must be set"),
            server_host: env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            server_port: env::var("SERVER_PORT")
                .unwrap_or_else(|_| "3000".into())
                .parse()
                .expect("SERVER_PORT must be a valid u16"),
            base_url: env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3000".into()),
        }
    }
}
