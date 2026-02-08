# Gideon Tasks

A private, invite-only task marketplace for the Carolinas. Requesters post tasks, doers apply and complete work, and payments flow through Stripe Connect with escrow protection.

Licensed under the [Gideon Christian Open Source License (GCOSL) v1.0](LICENSE.md).

## Architecture

| Layer    | Stack                                              |
| -------- | -------------------------------------------------- |
| Backend  | Rust · Axum · SQLx · PostgreSQL                    |
| Frontend | Next.js 16 · TypeScript · Tailwind CSS 4 · Zustand |
| Payments | Stripe Connect (manual-capture escrow)             |
| CI/CD    | GitHub Actions                                     |

## Features

**Task lifecycle** — Draft → Pending Review → Published → Assigned → In Progress → Submitted → Completed, with branching paths for disputes, cancellations, and expiration. State transitions enforced by a backend state machine.

**Stripe Connect escrow** — Payment is authorized on assignment, captured when the doer starts work, and transferred to the doer on approval. Gideon fee is 1%; Stripe processing fees are reverse-engineered so doer and platform amounts are exact to the cent.

**Trust system** — Four levels (0–3) computed from completed tasks, dispute history, account age, and review scores. Level 3 requires admin sign-off.

**Content moderation** — Regex-based pipeline auto-approves, flags, or rejects task and message content.

**Audit log** — Append-only log of all financial and state-changing actions, protected by a database trigger that prevents UPDATE and DELETE.

**Invite-only registration** — Users join via invite codes tied to attestors (churches, nonprofits, organizations).

**Reviews** — Four-dimension ratings: reliability, quality, communication, integrity.

**Admin dashboard** — Moderation queue, dispute resolution, user management, audit log viewer.

## Prerequisites

- PostgreSQL 12+
- Rust stable (2024 edition)
- Node.js 22+
- Stripe API keys (test or live)

## Setup

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env — see below for required variables
```

```
DATABASE_URL=postgres://user:pass@localhost/gideon_tasks
JWT_SECRET=<random-secret>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SERVER_PORT=8080
BASE_URL=http://localhost:8080
```

Create the database and start the server (migrations run automatically on startup):

```bash
createdb gideon_tasks
cargo run
```

Run tests:

```bash
cargo test --all-targets
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local:
#   NEXT_PUBLIC_API_URL=http://localhost:8080
#   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

npm install
npm run dev
```

The frontend runs on `http://localhost:3000` and the backend on `http://localhost:8080`.

## Project Structure

```
backend/
  src/
    auth/          # JWT, password hashing, middleware
    config/        # Environment variable loading
    errors/        # Centralized error types
    middleware/     # Rate limiting
    models/        # Domain types, state machine, fee math
    routes/        # HTTP handlers (44 endpoints)
    services/      # Payments, moderation, audit, reputation, trust
  migrations/      # PostgreSQL schema
  tests/           # Unit and integration tests

frontend/
  src/
    app/           # Next.js App Router pages (24 routes)
    components/    # React components (60+)
    lib/           # API client, hooks, store, types, utils
```

## CI/CD

GitHub Actions workflows run on pushes and PRs to `main`:

- **Backend** — `cargo fmt --check`, Clippy, tests, release build, `cargo audit`
- **Frontend** — ESLint, TypeScript type check, Next.js build, `npm audit`

## Design Decisions

- **UUIDv7** for all identifiers (time-sortable)
- **Integer cents** for all monetary values (no floating point)
- **UTC timestamps** everywhere
- **Append-only audit log** with database-level immutability
- **Manual-capture PaymentIntents** for escrow without a third-party escrow service

## License

This project is licensed under the [Gideon Christian Open Source License (GCOSL) v1.0](LICENSE.md). Commercial rights are reserved exclusively by Gideon Solutions, LLC.
