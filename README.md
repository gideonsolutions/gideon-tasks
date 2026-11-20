# Gideon Tasks

A task marketplace open to everyone in the US. Requesters post tasks, doers apply and complete work, and payments flow through Stripe Connect with escrow protection. Payments are in US dollars.

Licensed under the [Gideon Christian Open Source License (GCOSL) v1.0](LICENSE.md).

## Architecture

| Layer    | Stack                                                   |
| -------- | ------------------------------------------------------- |
| App      | Next.js 16 · TypeScript · Tailwind CSS 4 · App Router   |
| Database | PostgreSQL (Neon serverless)                            |
| Payments | Stripe Connect (manual-capture escrow)                  |
| Hosting  | Vercel                                                  |

The app is a single Next.js project. Frontend pages live under `frontend/src/app`, and API route handlers under `frontend/src/app/api`. Server-only modules (DB, auth, email, Stripe, moderation) live in `frontend/src/server`.

## Features

**Task lifecycle** — Draft → Pending Review → Published → Assigned → In Progress → Submitted → Completed, with branching paths for disputes, cancellations, and expiration.

**Stripe Connect escrow** — Payment is authorized on assignment, captured when the doer starts work, and transferred on approval. Gideon fee starts at 5% (gradually reducing to 1% over time); Stripe processing fees are reverse-engineered so doer and platform amounts are exact to the cent.

- Requesters save a card first (Payment Card page: a Stripe Customer plus a card-only SetupIntent and the Payment Element). Assigning a doer creates and confirms a manual-capture PaymentIntent on that card; if the bank asks for 3-D Secure, the browser completes it with `stripe.handleNextAction`, and the task is only assigned once the hold is authorized.
- Doers set up payouts through Stripe Connect (Express dashboard, transfers only). Starting a task requires an account whose transfers and payouts are active, because starting is what charges the requester. The transfer on approval is tied to the captured charge (`source_transaction`).
- Every Stripe call is in `frontend/src/server/payments.ts` and uses an idempotency key derived from our own IDs; the decisions around them are pure functions in `frontend/src/server/payment-rules.ts`.

**Trust system** — Four levels (0–3) computed from completed tasks, dispute history, account age, and review scores. Level 3 requires admin sign-off. Every level, including level 0, can post and apply once the account's email is verified; level 0 is limited to tasks paying up to $100 and 2 active posted tasks.

**Content moderation** — Regex-based pipeline auto-approves, flags, or rejects task and message content.

**Audit log** — Append-only log of all financial and state-changing actions, protected by a database trigger that prevents UPDATE and DELETE.

**Open registration** — Anyone can sign up. New accounts confirm their email address through a single-use link (sent with Resend) before they can post or apply for tasks. Stripe checks a requester's card at booking and a doer's identity when they set up payouts.

**Invites and attestations (optional)** — An attestor (a church, nonprofit or organization) can issue invite codes. Signing up with one creates an attestation that the attestor confirms, which vouches for the member and raises their trust.

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
# Optional locally: RESEND_API_KEY and EMAIL_FROM. Without RESEND_API_KEY,
# verification links are printed to the server console instead of emailed.

npm install
npm run db:migrate    # apply schema to your database
npm run dev           # http://localhost:3000
```

### Tests

```bash
npm test              # vitest (fees, state machine, moderation, trust levels, email verification, payments with Stripe mocked)
npx tsc --noEmit      # type check
npm run build         # production build
```

## Deploy (Vercel)

1. Create a Neon project and copy the pooled connection string.
2. `vercel link` from `frontend/`.
3. Set env vars in the Vercel project: `DATABASE_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `BASE_URL` (used for links in emails and for Stripe Connect onboarding redirects), and `RESEND_API_KEY` (the Resend integration from the Vercel Marketplace sets it). `EMAIL_FROM` is optional and defaults to `Gideon Tasks <no-reply@gideontasks.com>`; its domain must be verified in Resend. In production, sign-ups without an invite fail with an error if `RESEND_API_KEY` is missing.
4. `npm run db:migrate` against the production database.
5. `vercel --prod`.
6. Add `www.gideontasks.com` (and `gideontasks.com`) as custom domains in the Vercel dashboard.
7. Add a Stripe webhook endpoint pointing to `https://www.gideontasks.com/api/webhooks/stripe` for events on your account: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.amount_capturable_updated` and `transfer.created`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
8. In the Stripe Dashboard, set the Connect branding (name, colour, icon) that Stripe-hosted onboarding requires, and enable Connect for US accounts. Onboarding links return to `/profile/stripe/return` and `/profile/stripe/refresh`.
