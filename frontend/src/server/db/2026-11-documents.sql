-- Gideon Tasks: secure documents (files on Tax Prep and IRS Notices &
-- Representation tasks, and proof of a preparer's PTIN or credential).
--
-- Apply to the production database and to the preview database before the
-- code that uses these tables is deployed. It only creates two new tables
-- (which reference tasks and users) and their indexes, and changes nothing
-- else, so it applies on top of 2026-11-tutoring-for-minors.sql and
-- 2026-11-tax-prep.sql. It is idempotent: running it again changes nothing. The same statements are in schema.sql,
-- which `npm run db:migrate` applies to a fresh database.
--
--   psql "$DATABASE_URL" -f frontend/src/server/db/2026-11-documents.sql
--
-- (or paste it into the Neon SQL editor).

BEGIN;

-- Files on a Tax Prep or IRS Notices & Representation task, in a private
-- Vercel Blob store. Only the requester and the assigned tasker can upload,
-- list, download and delete them (each their own uploads); an admin can open
-- them only while the task is disputed, and every access is in audit_log.
-- They are deleted 30 days after the task is completed, cancelled or
-- resolved (src/server/documents/). pathname is chosen by the server and
-- holds no user text; display_name is the sanitized file name, set to NULL
-- when the file is deleted. 'pending' is an upload token issued but not
-- finished; those are cleaned up after a day.
CREATE TABLE IF NOT EXISTS task_documents (
    id              UUID PRIMARY KEY,
    task_id         UUID NOT NULL REFERENCES tasks(id),
    uploader_id     UUID NOT NULL REFERENCES users(id),
    pathname        TEXT UNIQUE NOT NULL,
    display_name    TEXT,
    content_type    TEXT NOT NULL
                    CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/heic')),
    size_bytes      BIGINT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'uploaded', 'deleted')),
    deleted_reason  TEXT CHECK (deleted_reason IN ('uploader', 'retention', 'abandoned', 'invalid')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_at     TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_documents_task_id ON task_documents(task_id, status);
CREATE INDEX IF NOT EXISTS idx_task_documents_status_created_at ON task_documents(status, created_at);

-- Proof of a tasker's PTIN or credential, for an admin to review before
-- recording it. Only the uploader and admins can see it. The file is deleted
-- 90 days after the admin approves or rejects it (file_deleted_at); the row
-- stays so the tasker sees the outcome. review_note on a rejection is shown
-- to the tasker.
CREATE TABLE IF NOT EXISTS preparer_proofs (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    kind            TEXT NOT NULL CHECK (kind IN ('ptin', 'enrolled_agent', 'cpa', 'attorney')),
    pathname        TEXT UNIQUE NOT NULL,
    display_name    TEXT,
    content_type    TEXT NOT NULL
                    CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/heic')),
    size_bytes      BIGINT,
    status          TEXT NOT NULL DEFAULT 'uploading'
                    CHECK (status IN ('uploading', 'pending', 'approved', 'rejected', 'withdrawn', 'abandoned')),
    review_note     TEXT,
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    file_deleted_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_preparer_proofs_user_id ON preparer_proofs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_preparer_proofs_status ON preparer_proofs(status, created_at);

COMMIT;
