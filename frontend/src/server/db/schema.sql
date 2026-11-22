-- Gideon Tasks MVP Schema
-- All IDs are UUIDv7. All timestamps are UTC. All money is integer cents (BIGINT).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE users (
    id                          UUID PRIMARY KEY,
    email                       TEXT UNIQUE NOT NULL,
    phone                       TEXT UNIQUE NOT NULL,
    legal_first_name            TEXT NOT NULL,
    legal_last_name             TEXT NOT NULL,
    password_hash               TEXT NOT NULL,
    trust_level                 SMALLINT NOT NULL DEFAULT 0 CHECK (trust_level BETWEEN 0 AND 3),
    status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
    email_verified              BOOLEAN NOT NULL DEFAULT false,
    phone_verified              BOOLEAN NOT NULL DEFAULT false,
    stripe_customer_id          TEXT,
    stripe_connect_account_id   TEXT,
    id_verified_at              TIMESTAMPTZ,
    is_admin                    BOOLEAN NOT NULL DEFAULT false,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attestors
CREATE TABLE attestors (
    id              UUID PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('church', 'nonprofit', 'organization')),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    invite_quota    INTEGER NOT NULL DEFAULT 50,
    contact_email   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invites
CREATE TABLE invites (
    id              UUID PRIMARY KEY,
    attestor_id     UUID NOT NULL REFERENCES attestors(id),
    code            TEXT UNIQUE NOT NULL,
    target_email    TEXT,
    claimed_by      UUID REFERENCES users(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_code ON invites(code);
CREATE INDEX idx_invites_attestor_id ON invites(attestor_id);

-- Attestations
CREATE TABLE attestations (
    id              UUID PRIMARY KEY,
    attestor_id     UUID NOT NULL REFERENCES attestors(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'revoked')),
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attestations_user_id ON attestations(user_id);
CREATE INDEX idx_attestations_attestor_id ON attestations(attestor_id);

-- Categories
CREATE TABLE categories (
    id              UUID PRIMARY KEY,
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,
    parent_id       UUID REFERENCES categories(id),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      INTEGER NOT NULL DEFAULT 100
);

CREATE INDEX idx_categories_slug ON categories(slug);

-- Tasks
CREATE TABLE tasks (
    id                  UUID PRIMARY KEY,
    requester_id        UUID NOT NULL REFERENCES users(id),
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    category_id         UUID NOT NULL REFERENCES categories(id),
    location_type       TEXT NOT NULL CHECK (location_type IN ('in_person', 'remote')),
    location_address    TEXT,
    location_lat        DOUBLE PRECISION,
    location_lng        DOUBLE PRECISION,
    price_cents         BIGINT NOT NULL CHECK (price_cents >= 500),
    pricing_mode        TEXT NOT NULL DEFAULT 'doer_receives'
                        CHECK (pricing_mode IN ('doer_receives', 'requester_pays')),
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'pending_review', 'published', 'assigned',
                                          'in_progress', 'submitted', 'completed', 'disputed',
                                          'resolved', 'cancelled', 'expired', 'rejected')),
    deadline            TIMESTAMPTZ NOT NULL,
    assigned_doer_id    UUID REFERENCES users(id),
    moderation_note     TEXT,
    rejection_reason    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_requester_id ON tasks(requester_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_category_id ON tasks(category_id);
CREATE INDEX idx_tasks_assigned_doer_id ON tasks(assigned_doer_id);

-- Task Applications
CREATE TABLE task_applications (
    id          UUID PRIMARY KEY,
    task_id     UUID NOT NULL REFERENCES tasks(id),
    doer_id     UUID NOT NULL REFERENCES users(id),
    message     TEXT,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(task_id, doer_id)
);

CREATE INDEX idx_task_applications_task_id ON task_applications(task_id);
CREATE INDEX idx_task_applications_doer_id ON task_applications(doer_id);

-- Task Questions (public pre-assignment Q&A between doers and the requester)
CREATE TABLE task_questions (
    id              UUID PRIMARY KEY,
    task_id         UUID NOT NULL REFERENCES tasks(id),
    asker_id        UUID NOT NULL REFERENCES users(id),
    question_body   TEXT NOT NULL,
    answer_body     TEXT,
    answered_by_id  UUID REFERENCES users(id),
    answered_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_questions_task_id ON task_questions(task_id);

-- Task Messages (post-assignment only)
CREATE TABLE task_messages (
    id          UUID PRIMARY KEY,
    task_id     UUID NOT NULL REFERENCES tasks(id),
    sender_id   UUID NOT NULL REFERENCES users(id),
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_messages_task_id ON task_messages(task_id);

-- Payments
CREATE TABLE payments (
    id                          UUID PRIMARY KEY,
    task_id                     UUID UNIQUE NOT NULL REFERENCES tasks(id),
    requester_id                UUID NOT NULL REFERENCES users(id),
    doer_id                     UUID NOT NULL REFERENCES users(id),
    task_price_cents            BIGINT NOT NULL,
    gideon_fee_cents            BIGINT NOT NULL,
    stripe_fee_cents            BIGINT NOT NULL DEFAULT 0,
    total_charged_cents         BIGINT NOT NULL DEFAULT 0,
    doer_payout_cents           BIGINT NOT NULL,
    stripe_payment_intent_id    TEXT NOT NULL,
    stripe_transfer_id          TEXT,
    status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'escrowed', 'released', 'refunded', 'failed')),
    escrowed_at                 TIMESTAMPTZ,
    released_at                 TIMESTAMPTZ,
    refunded_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_task_id ON payments(task_id);

-- Reviews
CREATE TABLE reviews (
    id              UUID PRIMARY KEY,
    task_id         UUID NOT NULL REFERENCES tasks(id),
    reviewer_id     UUID NOT NULL REFERENCES users(id),
    reviewee_id     UUID NOT NULL REFERENCES users(id),
    reliability     SMALLINT NOT NULL CHECK (reliability BETWEEN 1 AND 5),
    quality         SMALLINT NOT NULL CHECK (quality BETWEEN 1 AND 5),
    communication   SMALLINT NOT NULL CHECK (communication BETWEEN 1 AND 5),
    integrity       SMALLINT NOT NULL CHECK (integrity BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(task_id, reviewer_id)
);

CREATE INDEX idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX idx_reviews_task_id ON reviews(task_id);

-- Reputation Summary (materialized, recomputed on review/task events)
CREATE TABLE reputation_summary (
    user_id             UUID PRIMARY KEY REFERENCES users(id),
    total_completed     INTEGER NOT NULL DEFAULT 0,
    completion_rate     REAL NOT NULL DEFAULT 0.0,
    on_time_rate        REAL NOT NULL DEFAULT 0.0,
    avg_reliability     REAL NOT NULL DEFAULT 0.0,
    avg_quality         REAL NOT NULL DEFAULT 0.0,
    avg_communication   REAL NOT NULL DEFAULT 0.0,
    avg_integrity       REAL NOT NULL DEFAULT 0.0,
    disputes_lost       INTEGER NOT NULL DEFAULT 0,
    positive_review_rate REAL NOT NULL DEFAULT 0.0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Moderation Log
CREATE TABLE moderation_log (
    id              UUID PRIMARY KEY,
    entity_type     TEXT NOT NULL CHECK (entity_type IN ('task', 'message', 'review', 'user')),
    entity_id       UUID NOT NULL,
    action          TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'flagged', 'escalated')),
    reason          TEXT,
    moderator_id    UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_moderation_log_entity ON moderation_log(entity_type, entity_id);

-- Audit Log (append-only — no UPDATE or DELETE)
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY,
    actor_id        UUID REFERENCES users(id),
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Refresh Tokens
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id),
    token_hash  TEXT UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Email Verifications (single-use links; only the SHA-256 hash of the token is stored)
CREATE TABLE IF NOT EXISTS email_verifications (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id),
    token_hash  TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id_created_at ON email_verifications(user_id, created_at);

-- The requester's saved card for bookings (a Stripe PaymentMethod attached
-- to users.stripe_customer_id). Card details stay with Stripe.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;

-- Password resets (single-use links valid for 1 hour; only the SHA-256 hash of the token is stored)
CREATE TABLE IF NOT EXISTS password_resets (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id),
    token_hash  TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id_created_at ON password_resets(user_id, created_at);

-- Tutoring for a child under 18. The account holder, the child's parent or
-- legal guardian, ticks "This is for my child under 18; I'm their parent or
-- legal guardian" on a Tutoring task. The API only allows it in Tutoring.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS for_minor BOOLEAN NOT NULL DEFAULT false;

-- Background checks. An admin records the result after reviewing the
-- third-party provider's report (no provider is integrated). Only a user with
-- background_check_cleared_at set may apply to, ask about, or be assigned a
-- for_minor task. The note is for admins: what was checked, or why it was
-- cleared.
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_check_cleared_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_check_note TEXT;

-- Tax preparers. An admin records a tasker's PTIN for the calendar year it
-- was verified for, and their credential, after checking the IRS Directory
-- of Federal Tax Return Preparers with Credentials and Select Qualifications
-- (and, for a CPA, the state board). No lookup is integrated. Only a user
-- with a PTIN recorded for the current calendar year (UTC) or later (next
-- year's may be recorded from December 1) may apply to, ask about, or be
-- assigned a Tax Prep task (src/server/tax-preparers.ts):
-- 26 CFR 1.6109-2(d) requires a PTIN of anyone paid to prepare all or
-- substantially all of a return, and PTINs expire on December 31 each year.
-- The PTIN and the notes are for admins; profiles show only the credential
-- and "PTIN on file for <year>". Clearing sets the value and year to NULL
-- and keeps the note saying why; audit_log has every change.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin_year SMALLINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin_recorded_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ptin_recorded_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_credential TEXT
    CHECK (tax_credential IN ('enrolled_agent', 'cpa', 'attorney'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_credential_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_credential_recorded_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_credential_recorded_by UUID REFERENCES users(id);

-- One account per PTIN.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ptin ON users(ptin) WHERE ptin IS NOT NULL;

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

-- Revoke UPDATE and DELETE on audit_log via a trigger (defense in depth)
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- Gideon Clerk: help with paperwork and online accounts, a service Gideon
-- Solutions, LLC (the company that runs Gideon Tasks) offers itself at a flat
-- hourly rate. Bookings are not tasks: no tasker, no Gideon Tasks fee, and
-- nothing in the task feed or the categories. The card hold is a
-- manual-capture PaymentIntent on the platform account for hours_booked x the
-- rate; after the session only hours_used x the rate is captured.
--
--   requested -> scheduled -> completed, or cancelled from requested/scheduled.
--
-- authorized_at is set once the card hold is authorized (it stays NULL while
-- the bank's 3-D Secure check is unfinished). hold_expires_at is when Stripe
-- would release the hold. All timestamps are UTC; money is integer cents.
CREATE TABLE IF NOT EXISTS clerk_bookings (
    id                          UUID PRIMARY KEY,
    user_id                     UUID NOT NULL REFERENCES users(id),
    hours_booked                SMALLINT NOT NULL CHECK (hours_booked >= 1),
    hours_used                  SMALLINT CHECK (hours_used >= 1),
    amount_authorized_cents     BIGINT NOT NULL CHECK (amount_authorized_cents > 0),
    amount_captured_cents       BIGINT CHECK (amount_captured_cents >= 0),
    status                      TEXT NOT NULL DEFAULT 'requested'
                                CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled')),
    session_type                TEXT NOT NULL CHECK (session_type IN ('video', 'phone')),
    time_zone                   TEXT NOT NULL,
    description                 TEXT NOT NULL,
    moderation_note             TEXT,
    payment_intent_id           TEXT UNIQUE,
    authorized_at               TIMESTAMPTZ,
    hold_expires_at             TIMESTAMPTZ,
    scheduled_for               TIMESTAMPTZ,
    meeting_details             TEXT,
    cancel_reason               TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at                TIMESTAMPTZ,
    cancelled_at                TIMESTAMPTZ,
    -- Never more hours than booked, never more money than authorized.
    CHECK (hours_used <= hours_booked),
    CHECK (amount_captured_cents <= amount_authorized_cents),
    CHECK (status NOT IN ('scheduled', 'completed')
           OR (authorized_at IS NOT NULL AND scheduled_for IS NOT NULL)),
    CHECK (status <> 'completed'
           OR (hours_used IS NOT NULL AND amount_captured_cents IS NOT NULL AND completed_at IS NOT NULL)),
    CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_clerk_bookings_user_id_created_at ON clerk_bookings(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_clerk_bookings_status ON clerk_bookings(status);

-- One open booking per customer.
CREATE UNIQUE INDEX IF NOT EXISTS clerk_bookings_one_open_per_user
    ON clerk_bookings(user_id) WHERE status IN ('requested', 'scheduled');
