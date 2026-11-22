-- Gideon Tasks: tutoring for minors (the guardian tick and background checks).
--
-- Apply to the production database and to the preview database before the
-- code that uses these columns is deployed. It is idempotent: running it
-- again changes nothing. The same statements are in schema.sql, which
-- `npm run db:migrate` applies to a fresh database.
--
--   psql "$DATABASE_URL" -f frontend/src/server/db/2026-11-tutoring-for-minors.sql
--
-- (or paste it into the Neon SQL editor).

BEGIN;

-- A Tutoring task a parent or legal guardian posted for their child under 18.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS for_minor BOOLEAN NOT NULL DEFAULT false;

-- When an admin recorded a cleared background check (NULL: none recorded),
-- and the admin's short note about it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_check_cleared_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_check_note TEXT;

COMMIT;
