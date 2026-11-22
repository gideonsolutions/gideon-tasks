-- Gideon Tasks: two-step sign-in (an authenticator app code after the
-- password), which secure documents and admin access to them require.
--
-- Apply to the production database and to the preview database before the
-- code that uses it is deployed. It adds columns to users and refresh_tokens
-- and creates one table and its index; it changes no existing data, so it
-- applies on top of every earlier file (2026-11-tutoring-for-minors.sql,
-- 2026-11-tax-prep.sql, 2026-11-gideon-clerk.sql, 2026-11-documents.sql).
-- It is idempotent (IF NOT EXISTS throughout): running it again changes
-- nothing. The same statements are in schema.sql, which `npm run db:migrate`
-- applies to a fresh database.
--
--   psql "$DATABASE_URL" -f frontend/src/server/db/2026-11-two-step.sql
--
-- (or paste it into the Neon SQL editor).

BEGIN;

-- Two-step sign-in (src/server/two-step/). The authenticator secret is
-- encrypted with AES-256-GCM under MFA_ENCRYPTION_KEY, which is only in the
-- environment; it is set while the user sets it up and takes effect only
-- when totp_enabled_at is set, after a code from it is confirmed.
-- totp_last_step is the last code's time step, so a code can't be used
-- twice. Every fifth wrong code in a row locks the second step
-- (totp_locked_until) for longer: 15 minutes, doubling, up to a day.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_locked_until TIMESTAMPTZ;

-- Whether the session a refresh token belongs to passed two-step sign-in. A
-- refresh keeps it and can never add it. Existing tokens are false.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS mfa_verified BOOLEAN NOT NULL DEFAULT false;

-- Ten single-use recovery codes per account, stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id),
    code_hash   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_id ON mfa_recovery_codes(user_id, code_hash);

COMMIT;
