import { createHash } from "node:crypto";

/**
 * Pure rules for the Stripe escrow flow: idempotency keys, what to do with an
 * earlier authorization attempt, payout readiness and user-facing messages.
 *
 * Kept free of DB, env and Stripe-client imports so the rules can be unit
 * tested. The Stripe calls themselves live in src/server/payments.ts.
 *
 * The flow (unchanged escrow semantics):
 *  1. A requester saves a card (Stripe Customer + SetupIntent).
 *  2. Assigning a doer creates and confirms a manual-capture PaymentIntent on
 *     that card. The task becomes `assigned` only once the PaymentIntent is
 *     authorized (`requires_capture`); if the bank asks for 3-D Secure the
 *     browser completes it with stripe.handleNextAction first.
 *  3. The doer starting work captures the PaymentIntent (payment `escrowed`).
 *  4. The requester approving creates the Transfer to the doer (`released`).
 */

export const ESCROW_CURRENCY = "usd";

/**
 * Cards only: manual capture (the escrow hold) is supported by cards, and the
 * saved payment method must be one we can place a hold on later.
 */
export const ESCROW_PAYMENT_METHOD_TYPES = ["card"];

export type PaymentRowStatus = "pending" | "escrowed" | "released" | "refunded" | "failed";

export type IntentStatus =
  | "canceled"
  | "processing"
  | "requires_action"
  | "requires_capture"
  | "requires_confirmation"
  | "requires_payment_method"
  | "succeeded";

/** PaymentIntent statuses that `paymentIntents.cancel` accepts for a card hold. */
const CANCELABLE: ReadonlySet<IntentStatus> = new Set([
  "requires_payment_method",
  "requires_capture",
  "requires_confirmation",
  "requires_action",
]);

export function isCancelable(status: IntentStatus): boolean {
  return CANCELABLE.has(status);
}

// ─── Idempotency keys ────────────────────────────────────
//
// Stripe keeps an idempotent result for 24 hours, so a retried request with
// the same key returns the first result instead of acting twice. Every key is
// derived from our own IDs, never from the clock or randomness, so a retry of
// the same logical operation always reuses its key.

const KEY_PREFIX = "gideon-tasks";

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export const idempotencyKeys = {
  /**
   * The parameters are part of the key: Stripe rejects a reused key whose
   * parameters differ, and a name change must not lock a user out for a day.
   */
  customer: (userId: string, params: unknown) =>
    `${KEY_PREFIX}:customer:${userId}:${fingerprint(params)}`,
  connectAccount: (userId: string) => `${KEY_PREFIX}:connect-account:${userId}`,
  /**
   * One key per authorization attempt. A failed attempt leaves its
   * PaymentIntent ID on the payment row, so the next attempt (a retry after a
   * decline, or a different doer or card) gets a new key, while a network
   * retry of the same attempt reuses the old one.
   */
  authorize: (a: {
    taskId: string;
    applicationId: string;
    paymentMethodId: string;
    amountCents: number;
    previousPaymentIntentId: string | null;
  }) =>
    `${KEY_PREFIX}:authorize:${a.taskId}:${a.applicationId}:${a.paymentMethodId}:${a.amountCents}:${a.previousPaymentIntentId ?? "first"}`,
  capture: (paymentIntentId: string) => `${KEY_PREFIX}:capture:${paymentIntentId}`,
  cancel: (paymentIntentId: string) => `${KEY_PREFIX}:cancel:${paymentIntentId}`,
  refund: (paymentIntentId: string) => `${KEY_PREFIX}:refund:${paymentIntentId}`,
  /** One transfer per payment row, whatever happens to the request. */
  transfer: (paymentId: string) => `${KEY_PREFIX}:transfer:${paymentId}`,
  /**
   * Gideon Clerk: one hold per booking row (a new booking is a new row), and
   * one capture per booking and amount.
   */
  clerkAuthorize: (a: { bookingId: string; paymentMethodId: string; amountCents: number }) =>
    `${KEY_PREFIX}:clerk-authorize:${a.bookingId}:${a.paymentMethodId}:${a.amountCents}`,
  clerkCapture: (paymentIntentId: string, amountCents: number) =>
    `${KEY_PREFIX}:clerk-capture:${paymentIntentId}:${amountCents}`,
};

/** Groups the charge and the doer's transfer in the Stripe Dashboard. */
export function transferGroupForTask(taskId: string): string {
  return `task_${taskId}`;
}

// ─── Authorization attempts ──────────────────────────────

export interface ExistingPayment {
  status: PaymentRowStatus;
  doer_id: string;
  total_charged_cents: number;
  stripe_payment_intent_id: string;
}

export interface LiveIntent {
  status: IntentStatus;
  amount: number;
  payment_method: string | null;
}

export interface AuthorizationRequest {
  doerId: string;
  amountCents: number;
  paymentMethodId: string;
}

export type AuthorizationPlan =
  /** Create a new PaymentIntent; replace the payment row for `previous` if set. */
  | { kind: "create"; previousPaymentIntentId: string | null; cancelPrevious: boolean }
  /** The earlier attempt is already authorized for this doer, amount and card. */
  | { kind: "authorized" }
  /** The earlier attempt is waiting for 3-D Secure; hand it back to the browser. */
  | { kind: "requires_action" }
  | { kind: "conflict"; reason: string };

/**
 * Decides what to do when a requester assigns a doer, given the task's
 * existing payment row (if any) and, for a pending row, its PaymentIntent as
 * Stripe reports it now.
 */
export function planAuthorization(
  existing: ExistingPayment | null,
  live: LiveIntent | null,
  request: AuthorizationRequest,
): AuthorizationPlan {
  if (!existing) {
    return { kind: "create", previousPaymentIntentId: null, cancelPrevious: false };
  }
  const previous = existing.stripe_payment_intent_id;

  if (existing.status === "failed") {
    return { kind: "create", previousPaymentIntentId: previous, cancelPrevious: false };
  }
  if (existing.status !== "pending") {
    return {
      kind: "conflict",
      reason: `This task already has a payment that is ${existing.status}.`,
    };
  }
  if (!live) {
    return { kind: "conflict", reason: "The earlier payment for this task could not be checked." };
  }

  const sameAttempt =
    existing.doer_id === request.doerId &&
    Number(existing.total_charged_cents) === request.amountCents &&
    live.amount === request.amountCents &&
    live.payment_method === request.paymentMethodId;

  if (live.status === "processing" || live.status === "succeeded") {
    // A captured or processing payment on an unassigned task needs a person.
    return {
      kind: "conflict",
      reason: "The earlier payment for this task is still being processed. Contact support if this persists.",
    };
  }
  if (sameAttempt && live.status === "requires_capture") return { kind: "authorized" };
  if (sameAttempt && live.status === "requires_action") return { kind: "requires_action" };

  // A different doer, amount or card, an abandoned or failed 3-D Secure
  // check, or a canceled hold: release whatever is still held and start over.
  return {
    kind: "create",
    previousPaymentIntentId: previous,
    cancelPrevious: isCancelable(live.status),
  };
}

// ─── Payouts ─────────────────────────────────────────────

export interface ConnectAccountState {
  details_submitted?: boolean | null;
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  capabilities?: { transfers?: string | null } | null;
  requirements?: {
    currently_due?: string[] | null;
    past_due?: string[] | null;
    disabled_reason?: string | null;
  } | null;
}

export interface PayoutStatus {
  connected: boolean;
  details_submitted: boolean;
  /** The account can receive transfers from the platform. */
  transfers_active: boolean;
  payouts_enabled: boolean;
  /** Both of the above: the doer can start work and be paid. */
  ready: boolean;
  /** Stripe still needs information; send the doer back through onboarding. */
  needs_more_info: boolean;
  /** Kept for the existing status page. */
  charges_enabled: boolean;
}

export const NOT_CONNECTED: PayoutStatus = {
  connected: false,
  details_submitted: false,
  transfers_active: false,
  payouts_enabled: false,
  ready: false,
  needs_more_info: true,
  charges_enabled: false,
};

/**
 * Doers' accounts only request the `transfers` capability, so
 * `charges_enabled` stays false for them and is not a readiness signal.
 */
export function payoutStatus(account: ConnectAccountState): PayoutStatus {
  const transfersActive = account.capabilities?.transfers === "active";
  const payoutsEnabled = account.payouts_enabled === true;
  const due = [
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.past_due ?? []),
  ];
  return {
    connected: true,
    details_submitted: account.details_submitted === true,
    transfers_active: transfersActive,
    payouts_enabled: payoutsEnabled,
    ready: transfersActive && payoutsEnabled,
    needs_more_info: account.details_submitted !== true || due.length > 0,
    charges_enabled: account.charges_enabled === true,
  };
}

// ─── Messages ────────────────────────────────────────────

export const MESSAGES = {
  noCard: "Add a payment card before assigning a doer. Go to Payment Card in the menu.",
  declined: (detail: string | undefined) =>
    `Your card was declined${detail ? ` (${detail})` : ""}. Try again, or add a different card under Payment Card.`,
  authenticationFailed:
    "Your bank could not confirm this payment. Try again, or add a different card under Payment Card.",
  payoutsNotReady:
    "Set up payouts before you start this task: open Stripe Connect in the menu and finish onboarding. The requester's card is only charged when you start.",
  authorizationExpired:
    "The hold on the requester's card has expired, so the payment could not be taken. The requester needs to cancel this task and book again.",
  doerAccountMissing: "The doer has not set up payouts yet, so the payment cannot be released.",
  clerkNoCard: "Add a payment card before you book Gideon Clerk. Go to Payment Card in the menu.",
  clerkHoldExpired:
    "The hold on the customer's card has lapsed, so nothing can be charged. Cancel this booking.",
};

/**
 * Short, safe text from a Stripe card error for the requester, for example
 * "insufficient funds". Never includes raw API text.
 */
export function declineDetail(err: { code?: string; decline_code?: string }): string | undefined {
  const code = err.decline_code ?? err.code;
  if (!code || code === "card_declined" || code === "generic_decline") return undefined;
  return code.replace(/_/g, " ");
}
