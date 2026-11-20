import { describe, it, expect } from "vitest";
import {
  ESCROW_PAYMENT_METHOD_TYPES,
  NOT_CONNECTED,
  declineDetail,
  idempotencyKeys,
  isCancelable,
  payoutStatus,
  planAuthorization,
  transferGroupForTask,
  type ExistingPayment,
  type IntentStatus,
  type LiveIntent,
} from "../payment-rules";

const TASK = "0190d0c0-0000-7000-8000-000000000001";
const APP = "0190d0c0-0000-7000-8000-000000000002";
const DOER = "0190d0c0-0000-7000-8000-000000000003";
const OTHER_DOER = "0190d0c0-0000-7000-8000-000000000004";

describe("idempotency keys", () => {
  const attempt = {
    taskId: TASK,
    applicationId: APP,
    paymentMethodId: "pm_123",
    amountCents: 10_628,
    previousPaymentIntentId: null,
  };

  it("are stable for a retry of the same operation", () => {
    expect(idempotencyKeys.authorize(attempt)).toBe(idempotencyKeys.authorize({ ...attempt }));
    expect(idempotencyKeys.capture("pi_1")).toBe(idempotencyKeys.capture("pi_1"));
    expect(idempotencyKeys.transfer("pay_1")).toBe(idempotencyKeys.transfer("pay_1"));
  });

  it("change for a new authorization attempt after a failed or released one", () => {
    const first = idempotencyKeys.authorize(attempt);
    const retry = idempotencyKeys.authorize({ ...attempt, previousPaymentIntentId: "pi_declined" });
    expect(retry).not.toBe(first);
    expect(first).toContain(":first");
    expect(retry).toContain(":pi_declined");
  });

  it("change when the doer, card or amount changes", () => {
    const base = idempotencyKeys.authorize(attempt);
    expect(idempotencyKeys.authorize({ ...attempt, applicationId: "other" })).not.toBe(base);
    expect(idempotencyKeys.authorize({ ...attempt, paymentMethodId: "pm_456" })).not.toBe(base);
    expect(idempotencyKeys.authorize({ ...attempt, amountCents: 10_629 })).not.toBe(base);
  });

  it("are distinct per operation for the same object", () => {
    const keys = new Set([
      idempotencyKeys.capture("pi_1"),
      idempotencyKeys.cancel("pi_1"),
      idempotencyKeys.refund("pi_1"),
    ]);
    expect(keys.size).toBe(3);
  });

  it("include the customer parameters, so a name change gets a fresh key", () => {
    const a = idempotencyKeys.customer("u1", { email: "a@example.com", name: "A B" });
    const b = idempotencyKeys.customer("u1", { email: "a@example.com", name: "A C" });
    expect(a).not.toBe(b);
    expect(idempotencyKeys.customer("u1", { email: "a@example.com", name: "A B" })).toBe(a);
  });

  it("fit Stripe's 255-character limit", () => {
    const long = idempotencyKeys.authorize({
      ...attempt,
      paymentMethodId: `pm_${"x".repeat(40)}`,
      previousPaymentIntentId: `pi_${"y".repeat(40)}`,
    });
    expect(long.length).toBeLessThanOrEqual(255);
    expect(idempotencyKeys.connectAccount(DOER).length).toBeLessThanOrEqual(255);
  });
});

describe("transferGroupForTask", () => {
  it("names the group after the task", () => {
    expect(transferGroupForTask(TASK)).toBe(`task_${TASK}`);
  });
});

describe("escrow payment method types", () => {
  it("are cards only, because the hold needs manual capture", () => {
    expect(ESCROW_PAYMENT_METHOD_TYPES).toEqual(["card"]);
  });
});

describe("planAuthorization", () => {
  const request = { doerId: DOER, amountCents: 10_628, paymentMethodId: "pm_123" };
  const pending = (over: Partial<ExistingPayment> = {}): ExistingPayment => ({
    status: "pending",
    doer_id: DOER,
    total_charged_cents: 10_628,
    stripe_payment_intent_id: "pi_prev",
    ...over,
  });
  const live = (status: IntentStatus, over: Partial<LiveIntent> = {}): LiveIntent => ({
    status,
    amount: 10_628,
    payment_method: "pm_123",
    ...over,
  });

  it("creates the first PaymentIntent when there is no payment yet", () => {
    expect(planAuthorization(null, null, request)).toEqual({
      kind: "create",
      previousPaymentIntentId: null,
      cancelPrevious: false,
    });
  });

  it("starts a new attempt after a failed one, without canceling anything", () => {
    expect(planAuthorization(pending({ status: "failed" }), null, request)).toEqual({
      kind: "create",
      previousPaymentIntentId: "pi_prev",
      cancelPrevious: false,
    });
  });

  it("reuses an earlier attempt that is already authorized", () => {
    expect(planAuthorization(pending(), live("requires_capture"), request)).toEqual({
      kind: "authorized",
    });
  });

  it("compares amounts stored as BIGINT strings", () => {
    const row = pending({ total_charged_cents: "10628" as unknown as number });
    expect(planAuthorization(row, live("requires_capture"), request).kind).toBe("authorized");
  });

  it("hands a pending 3-D Secure check back to the browser", () => {
    expect(planAuthorization(pending(), live("requires_action"), request)).toEqual({
      kind: "requires_action",
    });
  });

  it("releases the hold and starts over for a different doer", () => {
    expect(
      planAuthorization(pending({ doer_id: OTHER_DOER }), live("requires_capture"), request),
    ).toEqual({ kind: "create", previousPaymentIntentId: "pi_prev", cancelPrevious: true });
  });

  it("releases the hold and starts over for a different card or amount", () => {
    expect(
      planAuthorization(pending(), live("requires_capture", { payment_method: "pm_old" }), request),
    ).toMatchObject({ kind: "create", cancelPrevious: true });
    expect(
      planAuthorization(pending(), live("requires_capture", { amount: 9_999 }), request),
    ).toMatchObject({ kind: "create", cancelPrevious: true });
  });

  it("starts over after a failed 3-D Secure check", () => {
    expect(planAuthorization(pending(), live("requires_payment_method"), request)).toEqual({
      kind: "create",
      previousPaymentIntentId: "pi_prev",
      cancelPrevious: true,
    });
  });

  it("does not try to cancel a hold that has already expired", () => {
    expect(planAuthorization(pending(), live("canceled"), request)).toEqual({
      kind: "create",
      previousPaymentIntentId: "pi_prev",
      cancelPrevious: false,
    });
  });

  it.each(["processing", "succeeded"] as const)(
    "refuses to replace a %s payment",
    (status) => {
      expect(planAuthorization(pending(), live(status), request).kind).toBe("conflict");
    },
  );

  it.each(["escrowed", "released", "refunded"] as const)(
    "refuses when the task already has a %s payment",
    (status) => {
      expect(planAuthorization(pending({ status }), null, request).kind).toBe("conflict");
    },
  );

  it("refuses when a pending payment could not be checked with Stripe", () => {
    expect(planAuthorization(pending(), null, request).kind).toBe("conflict");
  });
});

describe("isCancelable", () => {
  it.each(["requires_payment_method", "requires_capture", "requires_confirmation", "requires_action"] as const)(
    "allows canceling %s",
    (status) => expect(isCancelable(status)).toBe(true),
  );
  it.each(["canceled", "succeeded", "processing"] as const)(
    "does not cancel %s",
    (status) => expect(isCancelable(status)).toBe(false),
  );
});

describe("payoutStatus", () => {
  it("is ready only when transfers are active and payouts are enabled", () => {
    const s = payoutStatus({
      details_submitted: true,
      payouts_enabled: true,
      charges_enabled: false,
      capabilities: { transfers: "active" },
      requirements: { currently_due: [], past_due: [] },
    });
    expect(s).toMatchObject({ connected: true, ready: true, needs_more_info: false });
  });

  it("ignores charges_enabled, which transfer-only accounts never get", () => {
    const s = payoutStatus({
      details_submitted: true,
      payouts_enabled: true,
      charges_enabled: false,
      capabilities: { transfers: "active" },
    });
    expect(s.ready).toBe(true);
    expect(s.charges_enabled).toBe(false);
  });

  it("is not ready while transfers are pending", () => {
    const s = payoutStatus({
      details_submitted: true,
      payouts_enabled: true,
      capabilities: { transfers: "pending" },
    });
    expect(s.ready).toBe(false);
    expect(s.needs_more_info).toBe(false);
  });

  it("is not ready without payouts", () => {
    expect(
      payoutStatus({ details_submitted: true, payouts_enabled: false, capabilities: { transfers: "active" } })
        .ready,
    ).toBe(false);
  });

  it("asks for more information while requirements are due or onboarding is unfinished", () => {
    expect(
      payoutStatus({
        details_submitted: true,
        payouts_enabled: false,
        capabilities: { transfers: "inactive" },
        requirements: { currently_due: ["external_account"] },
      }).needs_more_info,
    ).toBe(true);
    expect(payoutStatus({ details_submitted: false }).needs_more_info).toBe(true);
  });

  it("reports an unconnected doer as not ready", () => {
    expect(NOT_CONNECTED).toMatchObject({ connected: false, ready: false, needs_more_info: true });
  });
});

describe("declineDetail", () => {
  it("names specific decline reasons", () => {
    expect(declineDetail({ code: "card_declined", decline_code: "insufficient_funds" })).toBe(
      "insufficient funds",
    );
    expect(declineDetail({ code: "expired_card" })).toBe("expired card");
  });

  it("adds nothing for generic declines", () => {
    expect(declineDetail({ code: "card_declined" })).toBeUndefined();
    expect(declineDetail({ code: "card_declined", decline_code: "generic_decline" })).toBeUndefined();
    expect(declineDetail({})).toBeUndefined();
  });
});
