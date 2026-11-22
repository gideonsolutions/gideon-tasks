import "server-only";
import type Stripe from "stripe";
import { execute, queryOne } from "./db";
import { newId } from "./auth";
import {
  calculateFees,
  feeBpsForVolume,
  type PricingMode,
} from "./fees";
import { platformVolumeCents } from "./platform-volume";
import { stripe } from "./stripe";
import { siteUrl } from "./env";
import { logAudit } from "./audit";
import { badRequest, conflict, forbidden, notFound, paymentError } from "./errors";
import { clerkAmountCents, formatHours, formatWholeDollars } from "./clerk-rules";
import {
  ESCROW_CURRENCY,
  ESCROW_PAYMENT_METHOD_TYPES,
  MESSAGES,
  NOT_CONNECTED,
  declineDetail,
  idempotencyKeys,
  payoutStatus,
  planAuthorization,
  transferGroupForTask,
  type IntentStatus,
  type PaymentRowStatus,
  type PayoutStatus,
} from "./payment-rules";

/**
 * Every Stripe call the app makes lives in this module (the client itself is
 * in ./stripe). The decisions around the calls are pure functions in
 * ./payment-rules so they can be tested without Stripe or a database.
 */

interface StripeLikeError {
  type?: string;
  code?: string;
  decline_code?: string;
  message?: string;
  payment_intent?: { id?: string; status?: string } | null;
}

function asStripeError(e: unknown): StripeLikeError {
  return (e ?? {}) as StripeLikeError;
}

function errorText(e: unknown): string {
  return asStripeError(e).message ?? String(e);
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

// ─── Requester: Stripe Customer and saved card ───────────

interface BillingRow {
  id: string;
  email: string;
  legal_first_name: string;
  legal_last_name: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
}

async function billingRow(userId: string): Promise<BillingRow> {
  const row = await queryOne<BillingRow>(
    `SELECT id, email, legal_first_name, legal_last_name,
            stripe_customer_id, stripe_payment_method_id
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!row) throw notFound("User not found");
  return row;
}

/** Returns the user's Stripe Customer, creating it on first use. */
export async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await billingRow(userId);
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const params = {
    email: user.email,
    name: `${user.legal_first_name} ${user.legal_last_name}`.trim(),
    metadata: { user_id: user.id },
  };
  let customer: Stripe.Customer;
  try {
    customer = await stripe().customers.create(params, {
      idempotencyKey: idempotencyKeys.customer(user.id, params),
    });
  } catch (e) {
    throw paymentError(`Stripe customer creation failed: ${errorText(e)}`);
  }

  // If two requests raced, keep whichever Customer was stored first.
  const stored = await queryOne<{ stripe_customer_id: string }>(
    `UPDATE users SET stripe_customer_id = $1, updated_at = now()
     WHERE id = $2 AND stripe_customer_id IS NULL
     RETURNING stripe_customer_id`,
    [customer.id, user.id],
  );
  if (stored) return stored.stripe_customer_id;
  const current = await billingRow(userId);
  return current.stripe_customer_id ?? customer.id;
}

/**
 * Starts saving a card: a SetupIntent for the user's Customer, cards only,
 * for on-session use (the requester is present whenever they book a doer).
 * Deliberately no idempotency key: each "Add card" is a new attempt, and an
 * unused SetupIntent holds nothing.
 */
export async function createCardSetupIntent(userId: string): Promise<{ clientSecret: string }> {
  const customerId = await ensureStripeCustomer(userId);
  let intent: Stripe.SetupIntent;
  try {
    intent = await stripe().setupIntents.create({
      customer: customerId,
      payment_method_types: ESCROW_PAYMENT_METHOD_TYPES,
      usage: "on_session",
      metadata: { user_id: userId },
    });
  } catch (e) {
    throw paymentError(`Stripe SetupIntent creation failed: ${errorText(e)}`);
  }
  if (!intent.client_secret) throw paymentError("No client_secret on SetupIntent");
  return { clientSecret: intent.client_secret };
}

export interface SavedCard {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

function cardOf(pm: Stripe.PaymentMethod): SavedCard | null {
  if (pm.type !== "card" || !pm.card) return null;
  return {
    brand: pm.card.brand,
    last4: pm.card.last4,
    exp_month: pm.card.exp_month,
    exp_year: pm.card.exp_year,
  };
}

/**
 * Records the card from a succeeded SetupIntent as the user's card for
 * bookings. The SetupIntent must belong to the user's own Customer.
 */
export async function saveCardFromSetupIntent(
  userId: string,
  setupIntentId: string,
): Promise<SavedCard> {
  const user = await billingRow(userId);
  if (!user.stripe_customer_id) throw badRequest("Start by adding a card.");

  let intent: Stripe.SetupIntent;
  try {
    intent = await stripe().setupIntents.retrieve(setupIntentId);
  } catch (e) {
    throw paymentError(`Could not check the card setup: ${errorText(e)}`);
  }
  if (idOf(intent.customer) !== user.stripe_customer_id) {
    throw forbidden("This card setup belongs to a different account.");
  }
  if (intent.status !== "succeeded") {
    throw paymentError(
      intent.status === "processing"
        ? "Your card is still being checked. Refresh this page in a minute."
        : "The card was not saved. Try again.",
    );
  }
  const paymentMethodId = idOf(intent.payment_method);
  if (!paymentMethodId) throw paymentError("The card was not saved. Try again.");

  let pm: Stripe.PaymentMethod;
  try {
    pm = await stripe().paymentMethods.retrieve(paymentMethodId);
  } catch (e) {
    throw paymentError(`Could not read the saved card: ${errorText(e)}`);
  }
  const card = cardOf(pm);
  if (!card || idOf(pm.customer) !== user.stripe_customer_id) {
    throw paymentError("Only cards can be used to book doers.");
  }

  await execute(
    `UPDATE users SET stripe_payment_method_id = $1, updated_at = now() WHERE id = $2`,
    [paymentMethodId, userId],
  );
  await logAudit(
    userId,
    "user.payment_method_saved",
    "user",
    userId,
    { payment_method_id: user.stripe_payment_method_id },
    { payment_method_id: paymentMethodId, brand: card.brand, last4: card.last4 },
  );
  return card;
}

export async function getSavedCard(userId: string): Promise<SavedCard | null> {
  const user = await billingRow(userId);
  if (!user.stripe_payment_method_id) return null;
  try {
    return cardOf(await stripe().paymentMethods.retrieve(user.stripe_payment_method_id));
  } catch (e) {
    throw paymentError(`Could not read the saved card: ${errorText(e)}`);
  }
}

// ─── Doer: Stripe Connect payouts ────────────────────────

/** Connect onboarding returns here (pages under src/app/(dashboard)/profile/stripe). */
export const CONNECT_RETURN_PATH = "/profile/stripe/return";
export const CONNECT_REFRESH_PATH = "/profile/stripe/refresh";

/**
 * Creates the doer's connected account on first use (Express dashboard,
 * expressed as controller properties as Stripe's docs now do; transfers
 * only; US) and returns a fresh, single-use onboarding link.
 */
export async function createPayoutOnboardingLink(userId: string): Promise<{ url: string }> {
  const row = await queryOne<{ email: string; stripe_connect_account_id: string | null }>(
    `SELECT email, stripe_connect_account_id FROM users WHERE id = $1`,
    [userId],
  );
  if (!row) throw notFound("User not found");

  const s = stripe();
  let accountId = row.stripe_connect_account_id;
  if (!accountId) {
    let account: Stripe.Account;
    try {
      account = await s.accounts.create(
        {
          controller: {
            fees: { payer: "application" },
            losses: { payments: "application" },
            stripe_dashboard: { type: "express" },
          },
          country: "US",
          email: row.email,
          capabilities: { transfers: { requested: true } },
          metadata: { user_id: userId },
        },
        { idempotencyKey: idempotencyKeys.connectAccount(userId) },
      );
    } catch (e) {
      throw paymentError(`Stripe Connect account creation failed: ${errorText(e)}`);
    }
    // If two requests raced, keep whichever account was stored first.
    const stored = await queryOne<{ stripe_connect_account_id: string }>(
      `UPDATE users SET stripe_connect_account_id = $1, updated_at = now()
       WHERE id = $2 AND stripe_connect_account_id IS NULL
       RETURNING stripe_connect_account_id`,
      [account.id, userId],
    );
    if (stored) {
      accountId = stored.stripe_connect_account_id;
    } else {
      const again = await queryOne<{ stripe_connect_account_id: string | null }>(
        `SELECT stripe_connect_account_id FROM users WHERE id = $1`,
        [userId],
      );
      accountId = again?.stripe_connect_account_id ?? account.id;
    }
  }

  try {
    const link = await s.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: siteUrl(CONNECT_RETURN_PATH),
      refresh_url: siteUrl(CONNECT_REFRESH_PATH),
    });
    return { url: link.url };
  } catch (e) {
    throw paymentError(`Stripe onboarding link failed: ${errorText(e)}`);
  }
}

/** Live payout status from Stripe (no cached copy to go stale). */
export async function getPayoutStatus(userId: string): Promise<PayoutStatus> {
  const row = await queryOne<{ stripe_connect_account_id: string | null }>(
    `SELECT stripe_connect_account_id FROM users WHERE id = $1`,
    [userId],
  );
  if (!row?.stripe_connect_account_id) return NOT_CONNECTED;
  try {
    return payoutStatus(await stripe().accounts.retrieve(row.stripe_connect_account_id));
  } catch (e) {
    throw paymentError(`Could not check payout status: ${errorText(e)}`);
  }
}

/**
 * Called before the capture when a doer starts work, so money is never taken
 * for a doer whom the transfer on approval could not reach.
 */
export async function assertDoerCanBePaid(doerId: string): Promise<void> {
  const status = await getPayoutStatus(doerId);
  if (!status.ready) throw paymentError(MESSAGES.payoutsNotReady);
}

// ─── Escrow ──────────────────────────────────────────────

interface PaymentRow {
  id: string;
  task_id: string;
  doer_id: string;
  task_price_cents: number;
  doer_payout_cents: number;
  total_charged_cents: number;
  stripe_payment_intent_id: string;
  stripe_transfer_id: string | null;
  status: PaymentRowStatus;
}

async function findPayment(taskId: string): Promise<PaymentRow | null> {
  return queryOne<PaymentRow>(
    `SELECT id, task_id, doer_id, task_price_cents, doer_payout_cents, total_charged_cents,
            stripe_payment_intent_id, stripe_transfer_id, status
     FROM payments WHERE task_id = $1`,
    [taskId],
  );
}

async function fetchPayment(taskId: string): Promise<PaymentRow> {
  const row = await findPayment(taskId);
  if (!row) throw notFound("Payment not found");
  return row;
}

export type AuthorizationResult =
  | { status: "authorized"; paymentId: string; paymentIntentId: string }
  | {
      status: "requires_action";
      paymentId: string;
      paymentIntentId: string;
      clientSecret: string;
    };

export interface AuthorizeInput {
  taskId: string;
  applicationId: string;
  requesterId: string;
  doerId: string;
  anchorCents: number;
  pricingMode: PricingMode;
}

/**
 * Places the escrow hold for an assignment: a manual-capture PaymentIntent on
 * the requester's saved card, created and confirmed in one call. The task is
 * not touched here; the caller assigns it once this returns `authorized`.
 *
 * Calling it again for the same task is safe: an earlier attempt that is
 * already authorized is reused, one waiting for 3-D Secure is handed back,
 * and anything else is released and replaced (see planAuthorization).
 */
export async function authorizeEscrowPayment(input: AuthorizeInput): Promise<AuthorizationResult> {
  const billing = await billingRow(input.requesterId);
  const customerId = billing.stripe_customer_id;
  const paymentMethodId = billing.stripe_payment_method_id;
  if (!customerId || !paymentMethodId) throw paymentError(MESSAGES.noCard);

  const feeBps = feeBpsForVolume(await platformVolumeCents());
  const fees = calculateFees(input.anchorCents, input.pricingMode, feeBps);
  const s = stripe();

  const existing = await findPayment(input.taskId);
  let live: Stripe.PaymentIntent | null = null;
  if (existing?.status === "pending") {
    try {
      live = await s.paymentIntents.retrieve(existing.stripe_payment_intent_id);
    } catch (e) {
      throw paymentError(`Could not check the earlier payment: ${errorText(e)}`);
    }
  }

  const plan = planAuthorization(
    existing,
    live && {
      status: live.status as IntentStatus,
      amount: live.amount,
      payment_method: idOf(live.payment_method),
    },
    { doerId: input.doerId, amountCents: fees.total_charged_cents, paymentMethodId },
  );

  if (plan.kind === "conflict") throw conflict(plan.reason);
  if (plan.kind === "authorized" && existing) {
    return {
      status: "authorized",
      paymentId: existing.id,
      paymentIntentId: existing.stripe_payment_intent_id,
    };
  }
  if (plan.kind === "requires_action" && existing && live?.client_secret) {
    return {
      status: "requires_action",
      paymentId: existing.id,
      paymentIntentId: live.id,
      clientSecret: live.client_secret,
    };
  }

  const previous = plan.kind === "create" ? plan.previousPaymentIntentId : null;
  if (plan.kind === "create" && plan.cancelPrevious && previous) {
    await cancelIntent(previous);
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await s.paymentIntents.create(
      {
        amount: fees.total_charged_cents,
        currency: ESCROW_CURRENCY,
        capture_method: "manual",
        customer: customerId,
        payment_method: paymentMethodId,
        payment_method_types: ESCROW_PAYMENT_METHOD_TYPES,
        confirm: true,
        // 3-D Secure, if the bank asks for it, is completed in the browser
        // with stripe.handleNextAction.
        use_stripe_sdk: true,
        transfer_group: transferGroupForTask(input.taskId),
        metadata: {
          task_id: input.taskId,
          requester_id: input.requesterId,
          doer_id: input.doerId,
          application_id: input.applicationId,
        },
      },
      {
        idempotencyKey: idempotencyKeys.authorize({
          taskId: input.taskId,
          applicationId: input.applicationId,
          paymentMethodId,
          amountCents: fees.total_charged_cents,
          previousPaymentIntentId: previous,
        }),
      },
    );
  } catch (e) {
    const err = asStripeError(e);
    const declinedIntentId = err.payment_intent?.id;
    if (err.type === "StripeCardError" && declinedIntentId) {
      // Record the declined attempt so the next one gets a new idempotency key.
      await writePaymentRow(input, fees, declinedIntentId, "failed", previous);
      throw paymentError(MESSAGES.declined(declineDetail(err)));
    }
    throw paymentError(`Stripe PaymentIntent creation failed: ${errorText(e)}`);
  }

  const status = intent.status as IntentStatus;
  const held = status === "requires_capture" || status === "requires_action";
  const paymentId = await writePaymentRow(input, fees, intent.id, held ? "pending" : "failed", previous);
  if (!paymentId) {
    // Another request replaced the payment row first: release our hold.
    await cancelIntent(intent.id).catch(() => {});
    throw conflict("This task's payment changed while you were booking. Refresh the page and try again.");
  }

  if (status === "requires_capture") {
    return { status: "authorized", paymentId, paymentIntentId: intent.id };
  }
  if (status === "requires_action" && intent.client_secret) {
    return {
      status: "requires_action",
      paymentId,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
    };
  }
  throw paymentError(MESSAGES.declined(undefined));
}

/**
 * Inserts the task's payment row, or replaces the earlier attempt's row. The
 * replacement only happens if the row still points at `previousIntentId`, so
 * two concurrent bookings cannot both win. Returns the row ID, or null if
 * another request got there first. Columns and fee values are the same as
 * before: task_price_cents holds the doer payout, as it always has.
 */
async function writePaymentRow(
  input: AuthorizeInput,
  fees: ReturnType<typeof calculateFees>,
  paymentIntentId: string,
  status: "pending" | "failed",
  previousIntentId: string | null,
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO payments
       (id, task_id, requester_id, doer_id, task_price_cents, gideon_fee_cents,
        stripe_fee_cents, total_charged_cents, doer_payout_cents,
        stripe_payment_intent_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (task_id) DO UPDATE SET
       requester_id = EXCLUDED.requester_id,
       doer_id = EXCLUDED.doer_id,
       task_price_cents = EXCLUDED.task_price_cents,
       gideon_fee_cents = EXCLUDED.gideon_fee_cents,
       stripe_fee_cents = EXCLUDED.stripe_fee_cents,
       total_charged_cents = EXCLUDED.total_charged_cents,
       doer_payout_cents = EXCLUDED.doer_payout_cents,
       stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
       status = EXCLUDED.status,
       stripe_transfer_id = NULL,
       escrowed_at = NULL,
       released_at = NULL,
       refunded_at = NULL
     WHERE payments.status IN ('pending', 'failed')
       AND payments.stripe_payment_intent_id = $12
     RETURNING id`,
    [
      newId(),
      input.taskId,
      input.requesterId,
      input.doerId,
      fees.doer_payout_cents,
      fees.gideon_fee_cents,
      fees.stripe_fee_cents,
      fees.total_charged_cents,
      fees.doer_payout_cents,
      paymentIntentId,
      status,
      previousIntentId,
    ],
  );
  return row?.id ?? null;
}

/** Releases a hold. A PaymentIntent that is already canceled counts as done. */
async function cancelIntent(paymentIntentId: string): Promise<void> {
  const s = stripe();
  try {
    await s.paymentIntents.cancel(paymentIntentId, {}, {
      idempotencyKey: idempotencyKeys.cancel(paymentIntentId),
    });
  } catch (e) {
    let live: Stripe.PaymentIntent | null = null;
    try {
      live = await s.paymentIntents.retrieve(paymentIntentId);
    } catch {
      // Fall through to the original error.
    }
    if (live?.status === "canceled") return;
    throw paymentError(`Stripe cancel failed: ${errorText(e)}`);
  }
}

/** Doer starts work: capture the hold into escrow. */
export async function capturePayment(taskId: string): Promise<void> {
  const payment = await fetchPayment(taskId);
  if (payment.status === "escrowed") return;
  if (payment.status !== "pending") {
    throw paymentError(`Payment is ${payment.status} and cannot be captured`);
  }

  const s = stripe();
  const intentId = payment.stripe_payment_intent_id;
  try {
    await s.paymentIntents.capture(intentId, {}, {
      idempotencyKey: idempotencyKeys.capture(intentId),
    });
  } catch (e) {
    // An earlier request may have captured it and then failed before the
    // database write; Stripe's own state decides.
    let live: Stripe.PaymentIntent | null = null;
    try {
      live = await s.paymentIntents.retrieve(intentId);
    } catch {
      // Fall through to the original error.
    }
    if (live?.status === "canceled") throw paymentError(MESSAGES.authorizationExpired);
    if (live?.status !== "succeeded") {
      throw paymentError(`Stripe capture failed: ${errorText(e)}`);
    }
  }
  await execute(
    `UPDATE payments SET status = 'escrowed', escrowed_at = now()
     WHERE task_id = $1 AND status = 'pending'`,
    [taskId],
  );
}

/**
 * Requester approves: transfer the doer's payout. The transfer is tied to the
 * captured charge (source_transaction) so it succeeds even while the charge's
 * funds are still pending in the platform balance; the doer's share becomes
 * available when the charge's funds do.
 */
export async function releasePayment(taskId: string): Promise<void> {
  const payment = await fetchPayment(taskId);
  if (payment.status === "released") return;
  if (payment.status !== "escrowed") {
    throw paymentError(`Payment is ${payment.status} and cannot be released`);
  }

  const doerConnect = await queryOne<{ stripe_connect_account_id: string | null }>(
    `SELECT stripe_connect_account_id FROM users WHERE id = $1`,
    [payment.doer_id],
  );
  if (!doerConnect?.stripe_connect_account_id) {
    throw paymentError("Doer has no Stripe Connect account");
  }
  const destination = doerConnect.stripe_connect_account_id;
  const s = stripe();
  const group = transferGroupForTask(taskId);

  let chargeId: string | null;
  let transfer: Stripe.Transfer | undefined;
  try {
    const intent = await s.paymentIntents.retrieve(payment.stripe_payment_intent_id);
    chargeId = idOf(intent.latest_charge);
    // Guard against paying twice if an earlier request's transfer went
    // through but its database write did not (beyond the 24-hour
    // idempotency window).
    const earlier = await s.transfers.list({ transfer_group: group, limit: 10 });
    transfer = earlier.data.find(
      (t) =>
        idOf(t.destination) === destination &&
        t.metadata?.payment_id === payment.id &&
        !t.reversed,
    );
  } catch (e) {
    throw paymentError(`Stripe transfer failed: ${errorText(e)}`);
  }

  if (!transfer) {
    try {
      transfer = await s.transfers.create(
        {
          // BIGINT columns arrive from the Neon driver as strings.
          amount: Number(payment.doer_payout_cents),
          currency: ESCROW_CURRENCY,
          destination,
          // With a source_transaction, Stripe copies the charge's
          // transfer_group onto the transfer itself.
          ...(chargeId ? { source_transaction: chargeId } : { transfer_group: group }),
          metadata: { task_id: taskId, payment_id: payment.id },
        },
        { idempotencyKey: idempotencyKeys.transfer(payment.id) },
      );
    } catch (e) {
      throw paymentError(`Stripe transfer failed: ${errorText(e)}`);
    }
  }

  await execute(
    `UPDATE payments
     SET status = 'released', released_at = now(), stripe_transfer_id = $1
     WHERE task_id = $2`,
    [transfer.id, taskId],
  );
}

/**
 * Cancellation, or a dispute decided for the requester. An uncaptured hold
 * is released; a captured payment is refunded in full (Gideon absorbs its
 * fee).
 */
export async function refundPayment(taskId: string): Promise<void> {
  const payment = await fetchPayment(taskId);
  const intentId = payment.stripe_payment_intent_id;

  switch (payment.status) {
    case "refunded":
    case "failed":
      // Nothing is held: either already returned, or never authorized.
      return;
    case "released":
      throw paymentError("This payment was already released to the doer and cannot be refunded here.");
    case "pending":
      await cancelIntent(intentId);
      break;
    case "escrowed":
      try {
        await stripe().refunds.create(
          { payment_intent: intentId },
          { idempotencyKey: idempotencyKeys.refund(intentId) },
        );
      } catch (e) {
        throw paymentError(`Stripe refund failed: ${errorText(e)}`);
      }
      break;
  }

  await execute(
    `UPDATE payments SET status = 'refunded', refunded_at = now() WHERE task_id = $1`,
    [taskId],
  );
}

// ─── Gideon Clerk (the house's own service) ──────────────
//
// Gideon Clerk is sold by Gideon Solutions, LLC itself, so its hold is a
// plain manual-capture PaymentIntent on the platform account: no transfer
// group, no connected account, no application fee and nothing added for
// Stripe. The customer is authorized for hours booked × CLERK_HOURLY_CENTS,
// and after the session only the hours used are captured.

export interface ClerkIntent {
  id: string;
  status: IntentStatus;
  amount: number;
  amountReceived: number;
  customerId: string | null;
  bookingId: string | null;
  userId: string | null;
  clientSecret: string | null;
  /** Stripe's capture_before for the card hold (Unix seconds), when the charge has one. */
  captureBefore: number | null;
}

function clerkIntentOf(pi: Stripe.PaymentIntent): ClerkIntent {
  const charge =
    pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  return {
    id: pi.id,
    status: pi.status as IntentStatus,
    amount: pi.amount,
    amountReceived: pi.amount_received ?? 0,
    customerId: idOf(pi.customer),
    bookingId: pi.metadata?.clerk_booking_id ?? null,
    userId: pi.metadata?.user_id ?? null,
    clientSecret: pi.client_secret ?? null,
    captureBefore: charge?.payment_method_details?.card?.capture_before ?? null,
  };
}

export type ClerkHoldResult =
  | { status: "authorized"; intent: ClerkIntent }
  | { status: "requires_action"; intent: ClerkIntent; clientSecret: string }
  | { status: "declined"; paymentIntentId: string | null; message: string };

/**
 * Places the hold for a Gideon Clerk booking on the customer's saved card,
 * created and confirmed in one call. 3-D Secure, if the bank asks for it, is
 * completed in the browser with stripe.handleNextAction, as for task
 * bookings. A decline is returned, not thrown, so the caller can close the
 * booking row it created first.
 */
export async function authorizeClerkHold(input: {
  bookingId: string;
  userId: string;
  hours: number;
}): Promise<ClerkHoldResult> {
  const billing = await billingRow(input.userId);
  const customerId = billing.stripe_customer_id;
  const paymentMethodId = billing.stripe_payment_method_id;
  if (!customerId || !paymentMethodId) throw paymentError(MESSAGES.clerkNoCard);
  const amountCents = clerkAmountCents(input.hours);

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe().paymentIntents.create(
      {
        amount: amountCents,
        currency: ESCROW_CURRENCY,
        capture_method: "manual",
        customer: customerId,
        payment_method: paymentMethodId,
        payment_method_types: ESCROW_PAYMENT_METHOD_TYPES,
        confirm: true,
        use_stripe_sdk: true,
        description: `Gideon Clerk, ${formatHours(input.hours)}`,
        metadata: {
          clerk_booking_id: input.bookingId,
          user_id: input.userId,
          hours_booked: String(input.hours),
        },
        // The charge's card details say when the hold lapses (capture_before).
        expand: ["latest_charge"],
      },
      {
        idempotencyKey: idempotencyKeys.clerkAuthorize({
          bookingId: input.bookingId,
          paymentMethodId,
          amountCents,
        }),
      },
    );
  } catch (e) {
    const err = asStripeError(e);
    if (err.type === "StripeCardError") {
      return {
        status: "declined",
        paymentIntentId: err.payment_intent?.id ?? null,
        message: MESSAGES.declined(declineDetail(err)),
      };
    }
    throw paymentError(`Stripe PaymentIntent creation failed: ${errorText(e)}`);
  }

  const live = clerkIntentOf(intent);
  if (live.status === "requires_capture") return { status: "authorized", intent: live };
  if (live.status === "requires_action" && live.clientSecret) {
    return { status: "requires_action", intent: live, clientSecret: live.clientSecret };
  }
  return { status: "declined", paymentIntentId: intent.id, message: MESSAGES.declined(undefined) };
}

/** A Gideon Clerk hold as Stripe reports it now. */
export async function retrieveClerkIntent(paymentIntentId: string): Promise<ClerkIntent> {
  try {
    return clerkIntentOf(
      await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] }),
    );
  } catch (e) {
    throw paymentError(`Could not check the card hold: ${errorText(e)}`);
  }
}

/**
 * Captures the hours used (a partial capture: Stripe releases the rest of
 * the hold). The caller has already checked the amount with
 * clerkCapturePlan; Stripe refuses anything above the authorized amount too.
 */
export async function captureClerkHold(paymentIntentId: string, amountCents: number): Promise<void> {
  const s = stripe();
  try {
    await s.paymentIntents.capture(
      paymentIntentId,
      { amount_to_capture: amountCents },
      { idempotencyKey: idempotencyKeys.clerkCapture(paymentIntentId, amountCents) },
    );
  } catch (e) {
    // An earlier request may have captured it and then failed before the
    // database write; Stripe's own state decides.
    let live: Stripe.PaymentIntent | null = null;
    try {
      live = await s.paymentIntents.retrieve(paymentIntentId);
    } catch {
      // Fall through to the original error.
    }
    if (live?.status === "canceled") throw paymentError(MESSAGES.clerkHoldExpired);
    if (live?.status === "succeeded") {
      if (live.amount_received === amountCents) return;
      throw conflict(
        `Stripe already captured ${formatWholeDollars(live.amount_received)} for this booking. Record the hours that match that amount.`,
      );
    }
    throw paymentError(`Stripe capture failed: ${errorText(e)}`);
  }
}

/** Releases a Gideon Clerk hold. One that is already canceled counts as done. */
export async function releaseClerkHold(paymentIntentId: string): Promise<void> {
  await cancelIntent(paymentIntentId);
}
