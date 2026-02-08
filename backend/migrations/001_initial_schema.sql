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
    is_active       BOOLEAN NOT NULL DEFAULT true
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
