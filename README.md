# Gideon Tasks

A private, invite-only task marketplace for the Carolinas. Requesters post tasks, doers apply and complete work, and payments flow through Stripe Connect with escrow protection.

Licensed under the [Gideon Christian Open Source License (GCOSL) v1.0](LICENSE.md).

## Architecture

| Layer    | Stack                                                   |
| -------- | ------------------------------------------------------- |
| App      | Next.js 16 · TypeScript · Tailwind CSS 4 · App Router   |
| Database | PostgreSQL (Neon serverless)                            |
| Payments | Stripe Connect (manual-capture escrow)                  |
| Hosting  | Vercel                                                  |

The app is a single Next.js project. Frontend pages live under `frontend/src/app`, and API route handlers under `frontend/src/app/api`. Server-only modules (DB, auth, Stripe, moderation) live in `frontend/src/server`.

## Features

**Task lifecycle** — Draft → Pending Review → Published → Assigned → In Progress → Submitted → Completed, with branching paths for disputes, cancellations, and expiration.

**Stripe Connect escrow** — Payment is authorized on assignment, captured when the doer starts work, and transferred on approval. Gideon fee is 1%; Stripe processing fees are reverse-engineered so doer and platform amounts are exact to the cent.

**Trust system** — Four levels (0–3) computed from completed tasks, dispute history, account age, and review scores. Level 3 requires admin sign-off.

**Content moderation** — Regex-based pipeline auto-approves, flags, or rejects task and message content.

**Audit log** — Append-only log of all financial and state-changing actions, protected by a database trigger that prevents UPDATE and DELETE.

**Invite-only registration** — Users join via invite codes tied to attestors (churches, nonprofits, organizations).

**Reviews** — Four-dimension ratings: reliability, quality, communication, integrity.

## Setup

### Prerequisites

- Node.js 22+
- A Postgres database (Neon recommended for serverless deploys)
- Stripe API keys (test or live)

### Local development

```bash
cd frontend
cp .env.example .env.local
# Fill in DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

npm install
npm run db:migrate    # apply schema to your database
npm run dev           # http://localhost:3000
```

### Tests

```bash
npm test              # vitest (fees, state machine, moderation)
npx tsc --noEmit      # type check
npm run build         # production build
```

## Deploy (Vercel)

1. Create a Neon project and copy the pooled connection string.
2. `vercel link` from `frontend/`.
3. Set env vars in the Vercel project: `DATABASE_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `BASE_URL`.
4. `npm run db:migrate` against the production database.
5. `vercel --prod`.
6. Add `www.gideontasks.com` (and `gideontasks.com`) as custom domains in the Vercel dashboard.
7. Add a Stripe webhook endpoint pointing to `https://www.gideontasks.com/api/webhooks/stripe`; copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
