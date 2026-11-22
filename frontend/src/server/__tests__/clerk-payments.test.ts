import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The Gideon Clerk Stripe calls in payments.ts, with Stripe mocked. They
 * cover what is sent to Stripe (the amount, and that nothing is added or
 * passed to a connected account), the idempotency keys and the error paths.
 */

const BOOKING = "0190d0c0-0000-7000-8000-0000000000c1";
const CUSTOMER = "0190d0c0-0000-7000-8000-0000000000c2";

const state = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    email: string;
    legal_first_name: string;
    legal_last_name: string;
    stripe_customer_id: string | null;
    stripe_payment_method_id: string | null;
  },
}));

const db = vi.hoisted(() => ({
  queryOne: vi.fn(async (sql: string) => {
    if (sql.includes("FROM users WHERE id")) return state.user ? { ...state.user } : null;
    throw new Error(`Unexpected queryOne: ${sql}`);
  }),
  execute: vi.fn(async (sql: string) => {
    throw new Error(`Unexpected execute: ${sql}`);
  }),
  query: vi.fn(),
}));

const stripeMock = vi.hoisted(() => ({
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
    capture: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("../db", () => db);
vi.mock("../stripe", () => ({ stripe: () => stripeMock }));
vi.mock("../audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("../auth", () => ({ newId: () => "0190d0c0-0000-7000-8000-0000000000ff" }));
vi.mock("../env", () => ({
  env: {},
  siteUrl: (path: string) => `https://www.gideontasks.com${path}`,
}));
vi.mock("../platform-volume", () => ({ platformVolumeCents: async () => 0 }));

import * as payments from "../payments";

const CAPTURE_BEFORE = 1_764_000_000;

function intent(over: Record<string, unknown> = {}) {
  return {
    id: "pi_clerk",
    status: "requires_capture",
    amount: 16_000,
    amount_received: 0,
    customer: "cus_c",
    client_secret: "pi_clerk_secret",
    metadata: { clerk_booking_id: BOOKING, user_id: CUSTOMER, hours_booked: "2" },
    latest_charge: { id: "ch_1", payment_method_details: { card: { capture_before: CAPTURE_BEFORE } } },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(stripeMock.paymentIntents)) fn.mockReset();
  state.user = {
    id: CUSTOMER,
    email: "kitty@example.com",
    legal_first_name: "Kitty",
    legal_last_name: "Cats",
    stripe_customer_id: "cus_c",
    stripe_payment_method_id: "pm_c",
  };
});

describe("authorizeClerkHold", () => {
  it("holds exactly hours × $80 on the platform account, with no fee and no connected account", async () => {
    stripeMock.paymentIntents.create.mockResolvedValue(intent());

    const result = await payments.authorizeClerkHold({ bookingId: BOOKING, userId: CUSTOMER, hours: 2 });

    expect(result).toMatchObject({ status: "authorized", intent: { id: "pi_clerk", captureBefore: CAPTURE_BEFORE } });
    const [params, options] = stripeMock.paymentIntents.create.mock.calls[0];
    // The whole parameter object: nothing else (no application_fee_amount,
    // transfer_data, on_behalf_of or transfer_group) is sent.
    expect(params).toEqual({
      amount: 16_000,
      currency: "usd",
      capture_method: "manual",
      customer: "cus_c",
      payment_method: "pm_c",
      payment_method_types: ["card"],
      confirm: true,
      use_stripe_sdk: true,
      description: "Gideon Clerk, 2 hours",
      metadata: { clerk_booking_id: BOOKING, user_id: CUSTOMER, hours_booked: "2" },
      expand: ["latest_charge"],
    });
    expect(options).toEqual({
      idempotencyKey: `gideon-tasks:clerk-authorize:${BOOKING}:pm_c:16000`,
    });
  });

  it("charges the same per hour at every length", async () => {
    for (const hours of [1, 2, 3, 4]) {
      stripeMock.paymentIntents.create.mockResolvedValueOnce(intent({ amount: hours * 8000 }));
      await payments.authorizeClerkHold({ bookingId: BOOKING, userId: CUSTOMER, hours });
    }
    const amounts = stripeMock.paymentIntents.create.mock.calls.map((c) => c[0].amount);
    expect(amounts).toEqual([8000, 16_000, 24_000, 32_000]);
  });

  it("refuses more than 4 hours before calling Stripe", async () => {
    await expect(
      payments.authorizeClerkHold({ bookingId: BOOKING, userId: CUSTOMER, hours: 5 }),
    ).rejects.toThrow(RangeError);
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("refuses without a saved card and never calls Stripe", async () => {
    state.user!.stripe_payment_method_id = null;
    await expect(
      payments.authorizeClerkHold({ bookingId: BOOKING, userId: CUSTOMER, hours: 1 }),
    ).rejects.toMatchObject({ kind: "payment_error", message: expect.stringContaining("Gideon Clerk") });
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("hands 3-D Secure back to the browser", async () => {
    stripeMock.paymentIntents.create.mockResolvedValue(
      intent({ status: "requires_action", latest_charge: null }),
    );
    const result = await payments.authorizeClerkHold({ bookingId: BOOKING, userId: CUSTOMER, hours: 2 });
    expect(result).toMatchObject({ status: "requires_action", clientSecret: "pi_clerk_secret" });
  });

  it("returns a decline instead of throwing, with the declined PaymentIntent", async () => {
    stripeMock.paymentIntents.create.mockRejectedValue(
      Object.assign(new Error("Your card was declined."), {
        type: "StripeCardError",
        code: "card_declined",
        decline_code: "insufficient_funds",
        payment_intent: { id: "pi_declined" },
      }),
    );
    const result = await payments.authorizeClerkHold({ bookingId: BOOKING, userId: CUSTOMER, hours: 2 });
    expect(result).toEqual({
      status: "declined",
      paymentIntentId: "pi_declined",
      message: expect.stringContaining("insufficient funds"),
    });
  });

  it("throws on other Stripe errors", async () => {
    stripeMock.paymentIntents.create.mockRejectedValue(new Error("connection reset"));
    await expect(
      payments.authorizeClerkHold({ bookingId: BOOKING, userId: CUSTOMER, hours: 2 }),
    ).rejects.toMatchObject({ kind: "payment_error" });
  });
});

describe("captureClerkHold", () => {
  it("captures only the amount given (a partial capture)", async () => {
    stripeMock.paymentIntents.capture.mockResolvedValue(intent({ status: "succeeded", amount_received: 8000 }));
    await payments.captureClerkHold("pi_clerk", 8000);
    expect(stripeMock.paymentIntents.capture).toHaveBeenCalledWith(
      "pi_clerk",
      { amount_to_capture: 8000 },
      { idempotencyKey: "gideon-tasks:clerk-capture:pi_clerk:8000" },
    );
  });

  it("accepts an earlier capture of the same amount", async () => {
    stripeMock.paymentIntents.capture.mockRejectedValue(new Error("already captured"));
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ status: "succeeded", amount_received: 8000 }));
    await expect(payments.captureClerkHold("pi_clerk", 8000)).resolves.toBeUndefined();
  });

  it("refuses when Stripe already captured a different amount", async () => {
    stripeMock.paymentIntents.capture.mockRejectedValue(new Error("already captured"));
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ status: "succeeded", amount_received: 16_000 }));
    await expect(payments.captureClerkHold("pi_clerk", 8000)).rejects.toMatchObject({
      kind: "conflict",
      message: expect.stringContaining("$160"),
    });
  });

  it("says so when the hold has lapsed", async () => {
    stripeMock.paymentIntents.capture.mockRejectedValue(new Error("canceled"));
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ status: "canceled" }));
    await expect(payments.captureClerkHold("pi_clerk", 8000)).rejects.toMatchObject({
      kind: "payment_error",
      message: expect.stringContaining("lapsed"),
    });
  });
});

describe("releaseClerkHold", () => {
  it("cancels the PaymentIntent", async () => {
    stripeMock.paymentIntents.cancel.mockResolvedValue(intent({ status: "canceled" }));
    await payments.releaseClerkHold("pi_clerk");
    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith(
      "pi_clerk",
      {},
      { idempotencyKey: "gideon-tasks:cancel:pi_clerk" },
    );
  });

  it("treats a hold that is already released as done", async () => {
    stripeMock.paymentIntents.cancel.mockRejectedValue(new Error("already canceled"));
    stripeMock.paymentIntents.retrieve.mockResolvedValue(intent({ status: "canceled" }));
    await expect(payments.releaseClerkHold("pi_clerk")).resolves.toBeUndefined();
  });
});
