import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateFees } from "../fees";

/**
 * payments.ts with the Stripe client mocked and a small in-memory stand-in
 * for the queries it runs. The SQL itself is exercised against Postgres
 * separately; these tests cover the state transitions, the idempotency keys
 * sent to Stripe and the error paths.
 */

const TASK = "0190d0c0-0000-7000-8000-0000000000a1";
const APP = "0190d0c0-0000-7000-8000-0000000000a2";
const REQUESTER = "0190d0c0-0000-7000-8000-0000000000a3";
const DOER = "0190d0c0-0000-7000-8000-0000000000a4";
const OTHER_DOER = "0190d0c0-0000-7000-8000-0000000000a5";
const NEW_ROW_ID = "0190d0c0-0000-7000-8000-0000000000ff";

interface UserRow {
  id: string;
  email: string;
  legal_first_name: string;
  legal_last_name: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_connect_account_id: string | null;
}

interface PaymentRow {
  id: string;
  task_id: string;
  requester_id: string;
  doer_id: string;
  task_price_cents: number;
  gideon_fee_cents: number;
  stripe_fee_cents: number;
  total_charged_cents: number;
  doer_payout_cents: number;
  stripe_payment_intent_id: string;
  stripe_transfer_id: string | null;
  status: string;
}

const state = vi.hoisted(() => ({
  users: {} as Record<string, UserRow>,
  payment: null as PaymentRow | null,
}));

const db = vi.hoisted(() => {
  const queryOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const users = state.users;
    if (sql.includes("INSERT INTO payments")) {
      const [id, taskId, requesterId, doerId, taskPrice, gideonFee, stripeFee, total, payout, pi, status, prev] =
        params as [string, string, string, string, number, number, number, number, number, string, string, string | null];
      const row = {
        task_id: taskId,
        requester_id: requesterId,
        doer_id: doerId,
        task_price_cents: taskPrice,
        gideon_fee_cents: gideonFee,
        stripe_fee_cents: stripeFee,
        total_charged_cents: total,
        doer_payout_cents: payout,
        stripe_payment_intent_id: pi,
        stripe_transfer_id: null,
        status,
      };
      if (!state.payment) {
        state.payment = { id, ...row };
        return { id };
      }
      const p = state.payment;
      if (["pending", "failed"].includes(p.status) && p.stripe_payment_intent_id === prev) {
        state.payment = { id: p.id, ...row };
        return { id: p.id };
      }
      return null;
    }
    if (sql.includes("FROM payments WHERE task_id")) {
      return state.payment && state.payment.task_id === params[0] ? { ...state.payment } : null;
    }
    if (sql.includes("UPDATE users SET stripe_customer_id")) {
      const u = users[params[1] as string];
      if (u.stripe_customer_id) return null;
      u.stripe_customer_id = params[0] as string;
      return { stripe_customer_id: u.stripe_customer_id };
    }
    if (sql.includes("UPDATE users SET stripe_connect_account_id")) {
      const u = users[params[1] as string];
      if (u.stripe_connect_account_id) return null;
      u.stripe_connect_account_id = params[0] as string;
      return { stripe_connect_account_id: u.stripe_connect_account_id };
    }
    if (sql.includes("FROM users WHERE id")) {
      const u = users[params[0] as string];
      return u ? { ...u } : null;
    }
    throw new Error(`Unexpected queryOne: ${sql}`);
  });

  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    const p = state.payment;
    if (sql.includes("SET status = 'escrowed'")) {
      if (p && p.status === "pending") p.status = "escrowed";
      return;
    }
    if (sql.includes("SET status = 'released'")) {
      if (p) {
        p.status = "released";
        p.stripe_transfer_id = params[0] as string;
      }
      return;
    }
    if (sql.includes("SET status = 'refunded'")) {
      if (p) p.status = "refunded";
      return;
    }
    if (sql.includes("SET stripe_payment_method_id")) {
      state.users[params[1] as string].stripe_payment_method_id = params[0] as string;
      return;
    }
    throw new Error(`Unexpected execute: ${sql}`);
  });

  return { queryOne, execute, query: vi.fn() };
});

const stripeMock = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  setupIntents: { create: vi.fn(), retrieve: vi.fn() },
  paymentMethods: { retrieve: vi.fn() },
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
    capture: vi.fn(),
    cancel: vi.fn(),
  },
  transfers: { create: vi.fn(), list: vi.fn() },
  refunds: { create: vi.fn() },
  accounts: { create: vi.fn(), retrieve: vi.fn() },
  accountLinks: { create: vi.fn() },
}));

const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => {}) }));

vi.mock("../db", () => db);
vi.mock("../stripe", () => ({ stripe: () => stripeMock }));
vi.mock("../audit", () => audit);
vi.mock("../auth", () => ({ newId: () => NEW_ROW_ID }));
vi.mock("../env", () => ({
  env: {},
  siteUrl: (path: string) => `https://www.gideontasks.com${path}`,
}));
vi.mock("../platform-volume", () => ({ platformVolumeCents: async () => 0 }));

import * as payments from "../payments";

const FEES = calculateFees(10_000, "doer_receives", 500);

function intent(over: Record<string, unknown> = {}) {
  return {
    id: "pi_1",
    status: "requires_capture",
    amount: FEES.total_charged_cents,
    payment_method: "pm_1",
    client_secret: "pi_1_secret_abc",
    latest_charge: null,
    ...over,
  };
}

function cardError(over: Record<string, unknown> = {}) {
  return Object.assign(new Error("Your card was declined."), {
    type: "StripeCardError",
    code: "card_declined",
    decline_code: "insufficient_funds",
    payment_intent: { id: "pi_declined", status: "requires_payment_method" },
    ...over,
  });
}

const authorizeInput = {
  taskId: TASK,
  applicationId: APP,
  requesterId: REQUESTER,
  doerId: DOER,
  anchorCents: 10_000,
  pricingMode: "doer_receives" as const,
};

function pendingPayment(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "0190d0c0-0000-7000-8000-0000000000b1",
    task_id: TASK,
    requester_id: REQUESTER,
    doer_id: DOER,
    task_price_cents: FEES.doer_payout_cents,
    gideon_fee_cents: FEES.gideon_fee_cents,
    stripe_fee_cents: FEES.stripe_fee_cents,
    total_charged_cents: FEES.total_charged_cents,
    doer_payout_cents: FEES.doer_payout_cents,
    stripe_payment_intent_id: "pi_prev",
    stripe_transfer_id: null,
    status: "pending",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const group of Object.values(stripeMock)) {
    for (const fn of Object.values(group)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  state.payment = null;
  state.users = {
    [REQUESTER]: {
      id: REQUESTER,
      email: "requester@example.com",
      legal_first_name: "Ruth",
      legal_last_name: "Requester",
      stripe_customer_id: "cus_1",
      stripe_payment_method_id: "pm_1",
      stripe_connect_account_id: null,
    },
    [DOER]: {
      id: DOER,
      email: "doer@example.com",
      legal_first_name: "Dan",
      legal_last_name: "Doer",
      stripe_customer_id: null,
      stripe_payment_method_id: null,
      stripe_connect_account_id: "acct_doer",
    },
  };
});

// ─── Authorization on assignment ─────────────────────────

describe("authorizeEscrowPayment", () => {
  it("refuses without a saved card and never calls Stripe", async () => {
    state.users[REQUESTER].stripe_payment_method_id = null;
    await expect(payments.authorizeEscrowPayment(authorizeInput)).rejects.toMatchObject({
      kind: "payment_error",
      message: expect.stringContaining("Add a payment card"),
    });
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("places a manual-capture hold on the saved card and records a pending payment", async () => {
    stripeMock.paymentIntents.create.mockResolvedValue(intent());

    const result = await payments.authorizeEscrowPayment(authorizeInput);

    expect(result).toEqual({ status: "authorized", paymentId: NEW_ROW_ID, paymentIntentId: "pi_1" });
    expect(stripeMock.paymentIntents.create).toHaveBeenCalledTimes(1);
    const [params, options] = stripeMock.paymentIntents.create.mock.calls[0];
    expect(params).toEqual({
      amount: FEES.total_charged_cents,
      currency: "usd",
      capture_method: "manual",
      customer: "cus_1",
      payment_method: "pm_1",
      payment_method_types: ["card"],
      confirm: true,
      use_stripe_sdk: true,
      transfer_group: `task_${TASK}`,
      metadata: {
        task_id: TASK,
        requester_id: REQUESTER,
        doer_id: DOER,
        application_id: APP,
      },
    });
    expect(options).toEqual({
      idempotencyKey: `gideon-tasks:authorize:${TASK}:${APP}:pm_1:${FEES.total_charged_cents}:first`,
    });
    // Fee columns are written exactly as before.
    expect(state.payment).toMatchObject({
      status: "pending",
      stripe_payment_intent_id: "pi_1",
      task_price_cents: FEES.doer_payout_cents,
      gideon_fee_cents: FEES.gideon_fee_cents,
      stripe_fee_cents: FEES.stripe_fee_cents,
      total_charged_cents: FEES.total_charged_cents,
      doer_payout_cents: FEES.doer_payout_cents,
    });
  });

  it("returns the client secret when the bank asks for 3-D Secure", async () => {
    stripeMock.paymentIntents.create.mockResolvedValue(intent({ status: "requires_action" }));

    const result = await payments.authorizeEscrowPayment(authorizeInput);

    expect(result).toEqual({
      status: "requires_action",
      paymentId: NEW_ROW_ID,
      paymentIntentId: "pi_1",
      clientSecret: "pi_1_secret_abc",
    });
    expect(state.payment?.status).toBe("pending");
  });

  it("resumes a 3-D Secure check instead of placing a second hold", async () => {
    state.payment = pendingPayment();
    stripeMock.paymentIntents.retrieve.mockResolvedValue(
      intent({ id: "pi_prev", status: "requires_action", client_secret: "pi_prev_secret" }),
    );

    const result = await payments.authorizeEscrowPayment(authorizeInput);

    expect(result).toMatchObject({ status: "requires_action", clientSecret: "pi_prev_secret" });
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
    expect(stripeMock.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it("finishes after 3-D Secure by reusing the authorized hold", async () => {
    state.payment = pendingPayment();
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ id: "pi_prev" }));

    const result = await payments.authorizeEscrowPayment(authorizeInput);

    expect(result).toEqual({
      status: "authorized",
      paymentId: state.payment!.id,
      paymentIntentId: "pi_prev",
    });
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("releases an earlier hold for another doer before placing the new one", async () => {
    state.payment = pendingPayment({ doer_id: OTHER_DOER });
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ id: "pi_prev" }));
    stripeMock.paymentIntents.cancel.mockResolvedValue(intent({ id: "pi_prev", status: "canceled" }));
    stripeMock.paymentIntents.create.mockResolvedValue(intent({ id: "pi_2" }));

    const result = await payments.authorizeEscrowPayment(authorizeInput);

    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith("pi_prev", {}, {
      idempotencyKey: "gideon-tasks:cancel:pi_prev",
    });
    expect(stripeMock.paymentIntents.create.mock.calls[0][1]).toEqual({
      idempotencyKey: `gideon-tasks:authorize:${TASK}:${APP}:pm_1:${FEES.total_charged_cents}:pi_prev`,
    });
    expect(result).toMatchObject({ status: "authorized", paymentIntentId: "pi_2" });
    expect(state.payment).toMatchObject({
      status: "pending",
      doer_id: DOER,
      stripe_payment_intent_id: "pi_2",
    });
  });

  it("records a declined attempt as failed, so the retry uses a new key", async () => {
    stripeMock.paymentIntents.create.mockRejectedValueOnce(cardError());

    await expect(payments.authorizeEscrowPayment(authorizeInput)).rejects.toMatchObject({
      kind: "payment_error",
      message: expect.stringContaining("insufficient funds"),
    });
    expect(state.payment).toMatchObject({ status: "failed", stripe_payment_intent_id: "pi_declined" });

    // The retry does not touch the declined PaymentIntent and uses a new key.
    stripeMock.paymentIntents.create.mockResolvedValueOnce(intent({ id: "pi_3" }));
    await expect(payments.authorizeEscrowPayment(authorizeInput)).resolves.toMatchObject({
      status: "authorized",
      paymentIntentId: "pi_3",
    });
    expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(stripeMock.paymentIntents.cancel).not.toHaveBeenCalled();
    const keys = stripeMock.paymentIntents.create.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys[0]).toMatch(/:first$/);
    expect(keys[1]).toMatch(/:pi_declined$/);
    expect(state.payment).toMatchObject({ status: "pending", stripe_payment_intent_id: "pi_3" });
  });

  it("does not record anything when Stripe fails without a PaymentIntent", async () => {
    stripeMock.paymentIntents.create.mockRejectedValue(
      Object.assign(new Error("Stripe is unavailable"), { type: "StripeAPIError" }),
    );
    await expect(payments.authorizeEscrowPayment(authorizeInput)).rejects.toMatchObject({
      kind: "payment_error",
      message: expect.stringContaining("Stripe is unavailable"),
    });
    expect(state.payment).toBeNull();
  });

  it("releases its own hold if another request replaced the payment first", async () => {
    // Another request inserted a row between our read and our write.
    stripeMock.paymentIntents.create.mockImplementation(async () => {
      state.payment = pendingPayment({ stripe_payment_intent_id: "pi_other" });
      return intent({ id: "pi_mine" });
    });
    stripeMock.paymentIntents.cancel.mockResolvedValue(intent({ id: "pi_mine", status: "canceled" }));

    await expect(payments.authorizeEscrowPayment(authorizeInput)).rejects.toMatchObject({
      kind: "conflict",
    });
    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith("pi_mine", {}, {
      idempotencyKey: "gideon-tasks:cancel:pi_mine",
    });
    expect(state.payment?.stripe_payment_intent_id).toBe("pi_other");
  });

  it("refuses when the task already has a captured payment", async () => {
    state.payment = pendingPayment({ status: "escrowed" });
    await expect(payments.authorizeEscrowPayment(authorizeInput)).rejects.toMatchObject({
      kind: "conflict",
    });
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });
});

// ─── Capture when the doer starts ────────────────────────

describe("capturePayment", () => {
  it("captures the hold and marks the payment escrowed", async () => {
    state.payment = pendingPayment();
    stripeMock.paymentIntents.capture.mockResolvedValue(intent({ id: "pi_prev", status: "succeeded" }));

    await payments.capturePayment(TASK);

    expect(stripeMock.paymentIntents.capture).toHaveBeenCalledWith("pi_prev", {}, {
      idempotencyKey: "gideon-tasks:capture:pi_prev",
    });
    expect(state.payment?.status).toBe("escrowed");
  });

  it("does nothing for a payment that is already escrowed", async () => {
    state.payment = pendingPayment({ status: "escrowed" });
    await payments.capturePayment(TASK);
    expect(stripeMock.paymentIntents.capture).not.toHaveBeenCalled();
  });

  it("recovers when Stripe already captured it on an earlier request", async () => {
    state.payment = pendingPayment();
    stripeMock.paymentIntents.capture.mockRejectedValue(new Error("This PaymentIntent has already been captured"));
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ id: "pi_prev", status: "succeeded" }));

    await payments.capturePayment(TASK);
    expect(state.payment?.status).toBe("escrowed");
  });

  it("explains an expired hold", async () => {
    state.payment = pendingPayment();
    stripeMock.paymentIntents.capture.mockRejectedValue(new Error("canceled"));
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ id: "pi_prev", status: "canceled" }));

    await expect(payments.capturePayment(TASK)).rejects.toMatchObject({
      kind: "payment_error",
      message: expect.stringContaining("hold on the requester's card has expired"),
    });
    expect(state.payment?.status).toBe("pending");
  });

  it("reports other capture failures and leaves the payment pending", async () => {
    state.payment = pendingPayment();
    stripeMock.paymentIntents.capture.mockRejectedValue(new Error("network down"));
    stripeMock.paymentIntents.retrieve.mockRejectedValue(new Error("network down"));

    await expect(payments.capturePayment(TASK)).rejects.toMatchObject({
      message: "Stripe capture failed: network down",
    });
    expect(state.payment?.status).toBe("pending");
  });

  it("refuses a failed authorization", async () => {
    state.payment = pendingPayment({ status: "failed" });
    await expect(payments.capturePayment(TASK)).rejects.toMatchObject({ kind: "payment_error" });
    expect(stripeMock.paymentIntents.capture).not.toHaveBeenCalled();
  });
});

describe("assertDoerCanBePaid", () => {
  const ready = {
    details_submitted: true,
    payouts_enabled: true,
    charges_enabled: false,
    capabilities: { transfers: "active" },
    requirements: { currently_due: [], past_due: [] },
  };

  it("passes when transfers and payouts work", async () => {
    stripeMock.accounts.retrieve.mockResolvedValue(ready);
    await expect(payments.assertDoerCanBePaid(DOER)).resolves.toBeUndefined();
    expect(stripeMock.accounts.retrieve).toHaveBeenCalledWith("acct_doer");
  });

  it("blocks a doer without a connected account, without calling Stripe", async () => {
    state.users[DOER].stripe_connect_account_id = null;
    await expect(payments.assertDoerCanBePaid(DOER)).rejects.toMatchObject({
      message: expect.stringContaining("Set up payouts"),
    });
    expect(stripeMock.accounts.retrieve).not.toHaveBeenCalled();
  });

  it("blocks a doer whose transfers are not active yet", async () => {
    stripeMock.accounts.retrieve.mockResolvedValue({ ...ready, capabilities: { transfers: "pending" } });
    await expect(payments.assertDoerCanBePaid(DOER)).rejects.toMatchObject({
      message: expect.stringContaining("Set up payouts"),
    });
  });
});

// ─── Transfer on approval ────────────────────────────────

describe("releasePayment", () => {
  beforeEach(() => {
    state.payment = pendingPayment({ status: "escrowed" });
    stripeMock.paymentIntents.retrieve.mockResolvedValue(
      intent({ id: "pi_prev", status: "succeeded", latest_charge: "ch_1" }),
    );
    stripeMock.transfers.list.mockResolvedValue({ data: [] });
  });

  it("transfers the doer's payout, tied to the captured charge", async () => {
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_1" });

    await payments.releasePayment(TASK);

    expect(stripeMock.transfers.list).toHaveBeenCalledWith({ transfer_group: `task_${TASK}`, limit: 10 });
    expect(stripeMock.transfers.create).toHaveBeenCalledWith(
      {
        amount: FEES.doer_payout_cents,
        currency: "usd",
        destination: "acct_doer",
        source_transaction: "ch_1",
        metadata: { task_id: TASK, payment_id: state.payment!.id },
      },
      { idempotencyKey: `gideon-tasks:transfer:${state.payment!.id}` },
    );
    expect(state.payment).toMatchObject({ status: "released", stripe_transfer_id: "tr_1" });
  });

  it("sends a numeric amount even though BIGINT columns arrive as strings", async () => {
    state.payment = pendingPayment({
      status: "escrowed",
      doer_payout_cents: String(FEES.doer_payout_cents) as unknown as number,
    });
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_1" });
    await payments.releasePayment(TASK);
    expect(stripeMock.transfers.create.mock.calls[0][0].amount).toBe(FEES.doer_payout_cents);
  });

  it("falls back to the transfer group when the charge is unknown", async () => {
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ id: "pi_prev", latest_charge: null }));
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_1" });
    await payments.releasePayment(TASK);
    const params = stripeMock.transfers.create.mock.calls[0][0];
    expect(params.transfer_group).toBe(`task_${TASK}`);
    expect(params.source_transaction).toBeUndefined();
  });

  it("reuses a transfer that already went through instead of paying twice", async () => {
    stripeMock.transfers.list.mockResolvedValue({
      data: [
        { id: "tr_reversed", destination: "acct_doer", metadata: { payment_id: state.payment!.id }, reversed: true },
        { id: "tr_done", destination: "acct_doer", metadata: { payment_id: state.payment!.id }, reversed: false },
      ],
    });

    await payments.releasePayment(TASK);

    expect(stripeMock.transfers.create).not.toHaveBeenCalled();
    expect(state.payment).toMatchObject({ status: "released", stripe_transfer_id: "tr_done" });
  });

  it("does nothing for a payment that is already released", async () => {
    state.payment = pendingPayment({ status: "released", stripe_transfer_id: "tr_old" });
    await payments.releasePayment(TASK);
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();
    expect(state.payment.stripe_transfer_id).toBe("tr_old");
  });

  it("refuses when the doer has no connected account", async () => {
    state.users[DOER].stripe_connect_account_id = null;
    await expect(payments.releasePayment(TASK)).rejects.toMatchObject({
      message: "Doer has no Stripe Connect account",
    });
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();
    expect(state.payment?.status).toBe("escrowed");
  });

  it("leaves the payment escrowed when the transfer fails", async () => {
    stripeMock.transfers.create.mockRejectedValue(new Error("account restricted"));
    await expect(payments.releasePayment(TASK)).rejects.toMatchObject({
      message: "Stripe transfer failed: account restricted",
    });
    expect(state.payment?.status).toBe("escrowed");
  });

  it("refuses a payment that was never captured", async () => {
    state.payment = pendingPayment({ status: "pending" });
    await expect(payments.releasePayment(TASK)).rejects.toMatchObject({ kind: "payment_error" });
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();
  });
});

// ─── Refunds and released holds ──────────────────────────

describe("refundPayment", () => {
  it("releases an uncaptured hold", async () => {
    state.payment = pendingPayment();
    stripeMock.paymentIntents.cancel.mockResolvedValue(intent({ id: "pi_prev", status: "canceled" }));

    await payments.refundPayment(TASK);

    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith("pi_prev", {}, {
      idempotencyKey: "gideon-tasks:cancel:pi_prev",
    });
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(state.payment?.status).toBe("refunded");
  });

  it("treats a hold that already expired as released", async () => {
    state.payment = pendingPayment();
    stripeMock.paymentIntents.cancel.mockRejectedValue(new Error("already canceled"));
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ id: "pi_prev", status: "canceled" }));

    await payments.refundPayment(TASK);
    expect(state.payment?.status).toBe("refunded");
  });

  it("refunds a captured payment in full", async () => {
    state.payment = pendingPayment({ status: "escrowed" });
    stripeMock.refunds.create.mockResolvedValue({ id: "re_1" });

    await payments.refundPayment(TASK);

    expect(stripeMock.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_prev" },
      { idempotencyKey: "gideon-tasks:refund:pi_prev" },
    );
    expect(state.payment?.status).toBe("refunded");
  });

  it("does nothing for a failed authorization", async () => {
    state.payment = pendingPayment({ status: "failed" });
    await payments.refundPayment(TASK);
    expect(stripeMock.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(state.payment?.status).toBe("failed");
  });

  it("refuses to refund a payment already released to the doer", async () => {
    state.payment = pendingPayment({ status: "released" });
    await expect(payments.refundPayment(TASK)).rejects.toMatchObject({ kind: "payment_error" });
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  it("leaves the payment as it was when the refund fails", async () => {
    state.payment = pendingPayment({ status: "escrowed" });
    stripeMock.refunds.create.mockRejectedValue(new Error("refund failed"));
    await expect(payments.refundPayment(TASK)).rejects.toMatchObject({
      message: "Stripe refund failed: refund failed",
    });
    expect(state.payment?.status).toBe("escrowed");
  });
});

// ─── Requester card ──────────────────────────────────────

describe("saving a card", () => {
  it("creates the Stripe Customer once, with an idempotency key", async () => {
    state.users[REQUESTER].stripe_customer_id = null;
    stripeMock.customers.create.mockResolvedValue({ id: "cus_new" });
    stripeMock.setupIntents.create.mockResolvedValue({ id: "seti_1", client_secret: "seti_1_secret" });

    const res = await payments.createCardSetupIntent(REQUESTER);

    expect(res).toEqual({ clientSecret: "seti_1_secret" });
    const [params, options] = stripeMock.customers.create.mock.calls[0];
    expect(params).toEqual({
      email: "requester@example.com",
      name: "Ruth Requester",
      metadata: { user_id: REQUESTER },
    });
    expect(options.idempotencyKey).toMatch(new RegExp(`^gideon-tasks:customer:${REQUESTER}:[0-9a-f]{16}$`));
    expect(state.users[REQUESTER].stripe_customer_id).toBe("cus_new");
    expect(stripeMock.setupIntents.create).toHaveBeenCalledWith({
      customer: "cus_new",
      payment_method_types: ["card"],
      usage: "on_session",
      metadata: { user_id: REQUESTER },
    });
  });

  it("reuses an existing Customer", async () => {
    stripeMock.setupIntents.create.mockResolvedValue({ id: "seti_1", client_secret: "seti_1_secret" });
    await payments.createCardSetupIntent(REQUESTER);
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
    expect(stripeMock.setupIntents.create.mock.calls[0][0].customer).toBe("cus_1");
  });

  it("keeps the first Customer if two requests raced", async () => {
    state.users[REQUESTER].stripe_customer_id = null;
    stripeMock.customers.create.mockImplementation(async () => {
      state.users[REQUESTER].stripe_customer_id = "cus_winner";
      return { id: "cus_loser" };
    });
    await expect(payments.ensureStripeCustomer(REQUESTER)).resolves.toBe("cus_winner");
  });

  it("records the card from a succeeded SetupIntent and audits it", async () => {
    stripeMock.setupIntents.retrieve.mockResolvedValue({
      id: "seti_1",
      customer: "cus_1",
      status: "succeeded",
      payment_method: "pm_new",
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: "pm_new",
      type: "card",
      customer: "cus_1",
      card: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2030 },
    });

    const card = await payments.saveCardFromSetupIntent(REQUESTER, "seti_1");

    expect(card).toEqual({ brand: "visa", last4: "4242", exp_month: 4, exp_year: 2030 });
    expect(state.users[REQUESTER].stripe_payment_method_id).toBe("pm_new");
    expect(audit.logAudit).toHaveBeenCalledWith(
      REQUESTER,
      "user.payment_method_saved",
      "user",
      REQUESTER,
      { payment_method_id: "pm_1" },
      { payment_method_id: "pm_new", brand: "visa", last4: "4242" },
    );
  });

  it("refuses a SetupIntent that belongs to another customer", async () => {
    stripeMock.setupIntents.retrieve.mockResolvedValue({
      id: "seti_1",
      customer: "cus_someone_else",
      status: "succeeded",
      payment_method: "pm_new",
    });
    await expect(payments.saveCardFromSetupIntent(REQUESTER, "seti_1")).rejects.toMatchObject({
      kind: "forbidden",
    });
    expect(state.users[REQUESTER].stripe_payment_method_id).toBe("pm_1");
  });

  it("refuses a SetupIntent that has not succeeded", async () => {
    stripeMock.setupIntents.retrieve.mockResolvedValue({
      id: "seti_1",
      customer: "cus_1",
      status: "requires_payment_method",
      payment_method: null,
    });
    await expect(payments.saveCardFromSetupIntent(REQUESTER, "seti_1")).rejects.toMatchObject({
      kind: "payment_error",
    });
    expect(stripeMock.paymentMethods.retrieve).not.toHaveBeenCalled();
  });
});

// ─── Doer onboarding ─────────────────────────────────────

describe("createPayoutOnboardingLink", () => {
  it("creates the connected account once and links back to the profile pages", async () => {
    state.users[DOER].stripe_connect_account_id = null;
    stripeMock.accounts.create.mockResolvedValue({ id: "acct_new" });
    stripeMock.accountLinks.create.mockResolvedValue({ url: "https://connect.stripe.com/setup/x" });

    const res = await payments.createPayoutOnboardingLink(DOER);

    expect(res).toEqual({ url: "https://connect.stripe.com/setup/x" });
    expect(stripeMock.accounts.create).toHaveBeenCalledWith(
      {
        controller: {
          fees: { payer: "application" },
          losses: { payments: "application" },
          stripe_dashboard: { type: "express" },
        },
        country: "US",
        email: "doer@example.com",
        capabilities: { transfers: { requested: true } },
        metadata: { user_id: DOER },
      },
      { idempotencyKey: `gideon-tasks:connect-account:${DOER}` },
    );
    expect(state.users[DOER].stripe_connect_account_id).toBe("acct_new");
    expect(stripeMock.accountLinks.create).toHaveBeenCalledWith({
      account: "acct_new",
      type: "account_onboarding",
      return_url: "https://www.gideontasks.com/profile/stripe/return",
      refresh_url: "https://www.gideontasks.com/profile/stripe/refresh",
    });
  });

  it("reuses an existing connected account", async () => {
    stripeMock.accountLinks.create.mockResolvedValue({ url: "https://connect.stripe.com/setup/y" });
    await payments.createPayoutOnboardingLink(DOER);
    expect(stripeMock.accounts.create).not.toHaveBeenCalled();
    expect(stripeMock.accountLinks.create.mock.calls[0][0].account).toBe("acct_doer");
  });
});
