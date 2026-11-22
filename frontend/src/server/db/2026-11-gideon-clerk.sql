-- Gideon Tasks: Gideon Clerk bookings (the clerk_bookings table).
--
-- Apply to the production database and to the preview database before the
-- code that uses this table is deployed. It is idempotent: running it again
-- changes nothing. The same statements are at the end of schema.sql, which
-- `npm run db:migrate` applies to a fresh database.
--
--   psql "$DATABASE_URL" -f frontend/src/server/db/2026-11-gideon-clerk.sql
--
-- (or paste it into the Neon SQL editor).

BEGIN;

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

COMMIT;
