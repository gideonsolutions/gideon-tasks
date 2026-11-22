-- Gideon Tasks: tax preparers (the PTIN rule and credential badges).
--
-- Apply to the production database and to the preview database before the
-- code that uses these columns is deployed, and after
-- 2026-11-tutoring-for-minors.sql. It is idempotent: running it again
-- changes nothing. The same statements are in schema.sql, which
-- `npm run db:migrate` applies to a fresh database.
--
--   psql "$DATABASE_URL" -f frontend/src/server/db/2026-11-tax-prep.sql
--
-- (or paste it into the Neon SQL editor).

BEGIN;

-- The PTIN an admin recorded, the calendar year it was verified for, the
-- admin's note, and when and by whom it was recorded. Only a PTIN recorded
-- for the current calendar year (UTC) lets a user take Tax Prep tasks.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin_year SMALLINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin_recorded_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin_recorded_by UUID REFERENCES users(id);

-- The credential an admin recorded (shown as a badge), with the same.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_credential TEXT
    CHECK (tax_credential IN ('enrolled_agent', 'cpa', 'attorney'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_credential_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_credential_recorded_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_credential_recorded_by UUID REFERENCES users(id);

-- One account per PTIN.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ptin ON users(ptin) WHERE ptin IS NOT NULL;

COMMIT;
