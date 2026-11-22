import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Gideon Clerk bookings (src/server/clerk.ts) with the Stripe calls and the
 * email transport mocked, and a small in-memory stand-in for the SQL. They
 * cover the status transitions, what is captured, and that a failed email
 * never undoes a saved booking.
 */

const CUSTOMER = "0190d0c0-0000-7000-8000-0000000000d1";
const ADMIN = "0190d0c0-0000-7000-8000-0000000000d2";
const BOOKING = "0190d0c0-0000-7000-8000-0000000000d3";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Row {
  id: string;
  user_id: string;
  hours_booked: number;
  hours_used: number | null;
  amount_authorized_cents: string;
  amount_captured_cents: string | null;
  status: string;
  session_type: string;
  time_zone: string;
  description: string;
  moderation_note: string | null;
  payment_intent_id: string | null;
  authorized_at: Date | null;
  hold_expires_at: Date | null;
  scheduled_for: Date | null;
  meeting_details: string | null;
  cancel_reason: string | null;
  created_at: Date;
  completed_at: Date | null;
  cancelled_at: Date | null;
}

const state = vi.hoisted(() => ({
  user: {} as {
    email: string;
    email_verified: boolean;
    status: string;
    stripe_customer_id: string | null;
    stripe_payment_method_id: string | null;
  },
  bookings: new Map<string, Row>(),
  admins: [] as string[],
}));

const db = vi.hoisted(() => {
  const users = () => ({
    legal_first_name: "Kitty",
    legal_last_name: "Cats",
    email: state.user.email,
    phone: "+15550000000",
  });
  const open = (r: { status: string }) => r.status === "requested" || r.status === "scheduled";

  const queryOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const b = state.bookings;
    if (sql.includes("SELECT email_verified, status, stripe_customer_id")) return { ...state.user };
    if (sql.includes("SELECT id FROM clerk_bookings")) {
      const found = [...b.values()].find((r) => r.user_id === params[0] && open(r));
      return found ? { id: found.id } : null;
    }
    if (sql.includes("COALESCE(payment_intent_id")) {
      const [reason, pi, id] = params as [string, string | null, string];
      const r = b.get(id);
      if (!r || r.status !== "requested" || r.authorized_at) return null;
      Object.assign(r, { status: "cancelled", cancelled_at: new Date(), cancel_reason: reason });
      r.payment_intent_id ??= pi;
      return { id };
    }
    if (sql.includes("SET payment_intent_id = $1, authorized_at = $2")) {
      const [pi, at, expires, id, amount] = params as [string, Date, Date, string, number];
      const r = b.get(id);
      if (
        !r ||
        r.status !== "requested" ||
        r.authorized_at ||
        (r.payment_intent_id !== null && r.payment_intent_id !== pi) ||
        Number(r.amount_authorized_cents) !== amount
      ) {
        return null;
      }
      Object.assign(r, { payment_intent_id: pi, authorized_at: at, hold_expires_at: expires });
      return { ...r };
    }
    if (sql.includes("SET status = 'scheduled'")) {
      const [when, details, id, from] = params as [Date, string, string, string];
      const r = b.get(id);
      if (!r || r.status !== from || !r.authorized_at) return null;
      Object.assign(r, { status: "scheduled", scheduled_for: when, meeting_details: details });
      return { ...r };
    }
    if (sql.includes("SET status = 'completed'")) {
      const [hoursUsed, captured, id] = params as [number, number, string];
      const r = b.get(id);
      if (!r || r.status !== "scheduled") return null;
      Object.assign(r, {
        status: "completed",
        hours_used: hoursUsed,
        amount_captured_cents: String(captured),
        completed_at: new Date(),
      });
      return { ...r };
    }
    if (sql.includes("WHERE id = $2 AND status IN ('requested', 'scheduled')")) {
      const [reason, id] = params as [string, string];
      const r = b.get(id);
      if (!r || !open(r)) return null;
      Object.assign(r, { status: "cancelled", cancelled_at: new Date(), cancel_reason: reason });
      return { ...r };
    }
    if (sql.includes("FROM clerk_bookings b JOIN users u")) {
      const r = b.get(params[0] as string);
      return r ? { ...r, ...users() } : null;
    }
    if (sql.includes("FROM clerk_bookings WHERE id = $1")) {
      const r = b.get(params[0] as string);
      return r ? { ...r } : null;
    }
    if (sql.includes("SELECT email FROM users WHERE id")) return { email: state.user.email };
    throw new Error(`Unexpected queryOne: ${sql}`);
  });

  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO clerk_bookings")) {
      const [id, userId, hours, amount, sessionType, tz, description, note] = params as [
        string, string, number, number, string, string, string, string | null,
      ];
      state.bookings.set(id, {
        id,
        user_id: userId,
        hours_booked: hours,
        hours_used: null,
        amount_authorized_cents: String(amount),
        amount_captured_cents: null,
        status: "requested",
        session_type: sessionType,
        time_zone: tz,
        description,
        moderation_note: note,
        payment_intent_id: null,
        authorized_at: null,
        hold_expires_at: null,
        scheduled_for: null,
        meeting_details: null,
        cancel_reason: null,
        created_at: new Date(),
        completed_at: null,
        cancelled_at: null,
      });
      return;
    }
    if (sql.includes("SET payment_intent_id = $1") && sql.includes("payment_intent_id IS NULL")) {
      const r = state.bookings.get(params[1] as string);
      if (r && r.payment_intent_id === null) r.payment_intent_id = params[0] as string;
      return;
    }
    throw new Error(`Unexpected execute: ${sql}`);
  });

  const query = vi.fn(async (sql: string) => {
    if (sql.includes("WHERE is_admin = true")) return state.admins.map((email) => ({ email }));
    throw new Error(`Unexpected query: ${sql}`);
  });

  return { queryOne, execute, query };
});

const paymentsMock = vi.hoisted(() => ({
  authorizeClerkHold: vi.fn(),
  captureClerkHold: vi.fn(),
  releaseClerkHold: vi.fn(),
  retrieveClerkIntent: vi.fn(),
}));
const emailMock = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => {}),
  escapeHtml: (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
}));
const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => {}) }));

vi.mock("../db", () => db);
vi.mock("../payments", () => paymentsMock);
vi.mock("../email", () => emailMock);
vi.mock("../audit", () => audit);
vi.mock("../auth", () => ({ newId: () => BOOKING }));
vi.mock("../env", () => ({
  env: {},
  siteUrl: (path: string) => `https://www.gideontasks.com${path}`,
}));

import * as clerk from "../clerk";

const DESCRIPTION =
  "I need help renewing my car registration online; the DMV site keeps rejecting my login. Free most afternoons.";

const input = {
  userId: CUSTOMER,
  hours: 2,
  sessionType: "video" as const,
  timeZone: "America/Chicago",
  description: DESCRIPTION,
};

function heldIntent(over: Record<string, unknown> = {}) {
  return {
    id: "pi_clerk",
    status: "requires_capture",
    amount: 16_000,
    amountReceived: 0,
    customerId: "cus_c",
    bookingId: BOOKING,
    userId: CUSTOMER,
    clientSecret: "pi_clerk_secret",
    captureBefore: null,
    ...over,
  };
}

/** A booking already in the table, authorized an hour ago. */
function seed(over: Partial<Row> = {}): Row {
  const now = Date.now();
  const row: Row = {
    id: BOOKING,
    user_id: CUSTOMER,
    hours_booked: 3,
    hours_used: null,
    amount_authorized_cents: "24000",
    amount_captured_cents: null,
    status: "requested",
    session_type: "phone",
    time_zone: "America/New_York",
    description: DESCRIPTION,
    moderation_note: null,
    payment_intent_id: "pi_clerk",
    authorized_at: new Date(now - HOUR),
    hold_expires_at: new Date(now - HOUR + 7 * DAY),
    scheduled_for: null,
    meeting_details: null,
    cancel_reason: null,
    created_at: new Date(now - HOUR),
    completed_at: null,
    cancelled_at: null,
    ...over,
  };
  state.bookings.set(row.id, row);
  return row;
}

const auditActions = () => audit.logAudit.mock.calls.map((c) => (c as unknown[])[1]);
const sentSubjects = () =>
  emailMock.sendEmail.mock.calls.map((c) => ((c as unknown[])[0] as { subject: string }).subject);

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(paymentsMock)) fn.mockReset();
  emailMock.sendEmail.mockReset();
  emailMock.sendEmail.mockResolvedValue(undefined);
  state.bookings.clear();
  state.admins = ["admin@example.com"];
  state.user = {
    email: "kitty@example.com",
    email_verified: true,
    status: "active",
    stripe_customer_id: "cus_c",
    stripe_payment_method_id: "pm_c",
  };
});

// ─── Booking ─────────────────────────────────────────────

describe("createClerkBooking", () => {
  it("records hours × $80, places the hold and emails the customer and the admins", async () => {
    paymentsMock.authorizeClerkHold.mockResolvedValue({ status: "authorized", intent: heldIntent() });

    const outcome = await clerk.createClerkBooking(input);

    expect(outcome.status).toBe("booked");
    expect(paymentsMock.authorizeClerkHold).toHaveBeenCalledWith({ bookingId: BOOKING, userId: CUSTOMER, hours: 2 });
    const row = state.bookings.get(BOOKING)!;
    expect(row).toMatchObject({ status: "requested", amount_authorized_cents: "16000", payment_intent_id: "pi_clerk" });
    expect(row.authorized_at).toBeInstanceOf(Date);
    expect(outcome.booking).toMatchObject({ hold_authorized: true, amount_authorized_cents: 16_000 });
    expect(auditActions()).toEqual(["clerk.booking.requested", "clerk.booking.hold_authorized"]);
    expect(sentSubjects()).toEqual(["Gideon Clerk: we have your booking", "New Gideon Clerk booking"]);
    expect(emailMock.sendEmail.mock.calls.map((c) => ((c as unknown[])[0] as { to: string }).to)).toEqual([
      "kitty@example.com",
      "admin@example.com",
    ]);
  });

  it("keeps the booking when the emails fail", async () => {
    paymentsMock.authorizeClerkHold.mockResolvedValue({ status: "authorized", intent: heldIntent() });
    emailMock.sendEmail.mockRejectedValue(new Error("RESEND_API_KEY must be set in production to send email"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await clerk.createClerkBooking(input);

    expect(outcome.status).toBe("booked");
    expect(state.bookings.get(BOOKING)).toMatchObject({ status: "requested", payment_intent_id: "pi_clerk" });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("puts nothing about the customer's request in the emails", async () => {
    paymentsMock.authorizeClerkHold.mockResolvedValue({ status: "authorized", intent: heldIntent() });
    await clerk.createClerkBooking(input);
    for (const call of emailMock.sendEmail.mock.calls) {
      const m = (call as unknown[])[0] as { text: string; html: string };
      expect(m.text).not.toContain("DMV");
      expect(m.text).toContain("never asks for, types, receives or stores your passwords");
    }
  });

  it("closes the booking when the card is declined, with nothing held", async () => {
    paymentsMock.authorizeClerkHold.mockResolvedValue({
      status: "declined",
      paymentIntentId: "pi_declined",
      message: "Your card was declined (insufficient funds).",
    });

    await expect(clerk.createClerkBooking(input)).rejects.toMatchObject({
      kind: "payment_error",
      message: expect.stringContaining("insufficient funds"),
    });
    expect(state.bookings.get(BOOKING)).toMatchObject({
      status: "cancelled",
      payment_intent_id: "pi_declined",
      cancel_reason: expect.stringContaining("declined"),
    });
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("closes the booking when Stripe can't be reached", async () => {
    paymentsMock.authorizeClerkHold.mockRejectedValue(
      Object.assign(new Error("Stripe PaymentIntent creation failed"), { kind: "payment_error" }),
    );
    await expect(clerk.createClerkBooking(input)).rejects.toThrow("Stripe");
    expect(state.bookings.get(BOOKING)?.status).toBe("cancelled");
  });

  it("waits for 3-D Secure without emailing anyone", async () => {
    paymentsMock.authorizeClerkHold.mockResolvedValue({
      status: "requires_action",
      intent: heldIntent({ status: "requires_action" }),
      clientSecret: "pi_clerk_secret",
    });

    const outcome = await clerk.createClerkBooking(input);

    expect(outcome).toMatchObject({ status: "requires_action", clientSecret: "pi_clerk_secret" });
    expect(state.bookings.get(BOOKING)).toMatchObject({ payment_intent_id: "pi_clerk", authorized_at: null });
    expect(outcome.booking.hold_authorized).toBe(false);
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("refuses an unconfirmed email, a missing card, an inactive account and bad hours before any hold", async () => {
    state.user.email_verified = false;
    await expect(clerk.createClerkBooking(input)).rejects.toMatchObject({ kind: "forbidden" });
    state.user.email_verified = true;

    state.user.stripe_payment_method_id = null;
    await expect(clerk.createClerkBooking(input)).rejects.toMatchObject({ kind: "payment_error" });
    state.user.stripe_payment_method_id = "pm_c";

    state.user.status = "suspended";
    await expect(clerk.createClerkBooking(input)).rejects.toMatchObject({ kind: "forbidden" });
    state.user.status = "active";

    for (const hours of [0, 5, 1.5]) {
      await expect(clerk.createClerkBooking({ ...input, hours })).rejects.toMatchObject({ kind: "bad_request" });
    }
    await expect(clerk.createClerkBooking({ ...input, timeZone: "Europe/Paris" })).rejects.toMatchObject({
      kind: "bad_request",
    });
    expect(paymentsMock.authorizeClerkHold).not.toHaveBeenCalled();
    expect(state.bookings.size).toBe(0);
  });

  it("moderates the description before saving anything", async () => {
    for (const description of [
      `${DESCRIPTION} My SSN is 123-45-6789.`,
      `${DESCRIPTION} password: hunter2`,
      `${DESCRIPTION} Call me on 555-123-4567.`,
    ]) {
      await expect(clerk.createClerkBooking({ ...input, description })).rejects.toMatchObject({
        kind: "content_rejected",
      });
    }
    await expect(clerk.createClerkBooking({ ...input, description: "help" })).rejects.toMatchObject({
      kind: "bad_request",
    });
    expect(state.bookings.size).toBe(0);
    expect(paymentsMock.authorizeClerkHold).not.toHaveBeenCalled();
  });

  it("books a flagged description with a note for the admin", async () => {
    paymentsMock.authorizeClerkHold.mockResolvedValue({ status: "authorized", intent: heldIntent() });
    await clerk.createClerkBooking({
      ...input,
      description: "I need help adding a third party to my utility account so my brother can call them.",
    });
    expect(state.bookings.get(BOOKING)?.moderation_note).toContain("coded language");
  });

  it("allows one open booking at a time", async () => {
    seed({ id: "0190d0c0-0000-7000-8000-0000000000e9" });
    await expect(clerk.createClerkBooking(input)).rejects.toMatchObject({
      kind: "conflict",
      message: clerk.CLERK_ONE_OPEN_BOOKING,
    });
    expect(paymentsMock.authorizeClerkHold).not.toHaveBeenCalled();
  });
});

describe("confirmClerkHold (after 3-D Secure)", () => {
  it("books the session once Stripe reports the hold", async () => {
    seed({ authorized_at: null, hold_expires_at: null });
    paymentsMock.retrieveClerkIntent.mockResolvedValue(
      heldIntent({ amount: 24_000, captureBefore: Math.floor(Date.now() / 1000) + 5 * 86_400 }),
    );

    const outcome = await clerk.confirmClerkHold(CUSTOMER, BOOKING);

    expect(outcome.status).toBe("booked");
    const row = state.bookings.get(BOOKING)!;
    expect(row.authorized_at).toBeInstanceOf(Date);
    // Stripe's capture_before wins over the 7-day default.
    expect(row.hold_expires_at!.getTime()).toBeLessThan(Date.now() + 5 * DAY + 1000);
    expect(sentSubjects()).toContain("Gideon Clerk: we have your booking");
  });

  it("closes the booking and releases the attempt when the bank says no", async () => {
    seed({ authorized_at: null, hold_expires_at: null });
    paymentsMock.retrieveClerkIntent.mockResolvedValue(
      heldIntent({ amount: 24_000, status: "requires_payment_method" }),
    );

    await expect(clerk.confirmClerkHold(CUSTOMER, BOOKING)).rejects.toMatchObject({ kind: "payment_error" });
    expect(paymentsMock.releaseClerkHold).toHaveBeenCalledWith("pi_clerk");
    expect(state.bookings.get(BOOKING)?.status).toBe("cancelled");
  });

  it("only works on the customer's own booking", async () => {
    seed({ authorized_at: null });
    await expect(clerk.confirmClerkHold(ADMIN, BOOKING)).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("handleClerkHoldAuthorizedEvent (webhook)", () => {
  const event = (over: Record<string, unknown> = {}) => ({
    id: "pi_clerk",
    status: "requires_capture",
    metadata: { clerk_booking_id: BOOKING, user_id: CUSTOMER },
    ...over,
  });

  it("finishes a booking whose customer closed the tab after 3-D Secure, once", async () => {
    seed({ authorized_at: null, hold_expires_at: null });
    paymentsMock.retrieveClerkIntent.mockResolvedValue(heldIntent({ amount: 24_000 }));

    await clerk.handleClerkHoldAuthorizedEvent(event());
    await clerk.handleClerkHoldAuthorizedEvent(event());

    expect(state.bookings.get(BOOKING)?.authorized_at).toBeInstanceOf(Date);
    expect(auditActions().filter((a) => a === "clerk.booking.hold_authorized")).toHaveLength(1);
  });

  it("releases a hold that belongs to a closed booking", async () => {
    seed({ status: "cancelled", authorized_at: null, cancelled_at: new Date() });
    await clerk.handleClerkHoldAuthorizedEvent(event());
    expect(paymentsMock.releaseClerkHold).toHaveBeenCalledWith("pi_clerk");
  });

  it("leaves alone a booking this database doesn't have", async () => {
    await clerk.handleClerkHoldAuthorizedEvent(event());
    expect(paymentsMock.releaseClerkHold).not.toHaveBeenCalled();
  });
});

// ─── Admin ───────────────────────────────────────────────

describe("scheduleClerkBooking", () => {
  it("schedules inside the hold window and emails the meeting details", async () => {
    seed();
    const when = new Date(Date.now() + DAY);

    const res = await clerk.scheduleClerkBooking({
      adminId: ADMIN,
      bookingId: BOOKING,
      scheduledFor: when,
      meetingDetails: "Join at the link in this email: <video link>",
    });

    expect(res.emailSent).toBe(true);
    expect(res.booking).toMatchObject({ status: "scheduled", scheduled_for: when.toISOString() });
    const message = (emailMock.sendEmail.mock.calls[0] as unknown[])[0] as { subject: string; text: string; html: string };
    expect(message.subject).toBe("Gideon Clerk: your session is scheduled");
    expect(message.text).toContain("<video link>");
    expect(message.html).toContain("&lt;video link&gt;");
    expect(auditActions()).toEqual(["clerk.booking.scheduled"]);
    // The audit log records that details were sent, not the details.
    const newValue = (audit.logAudit.mock.calls[0] as unknown[])[5];
    expect(JSON.stringify(newValue)).not.toContain("video link");
  });

  it("reports a failed email but keeps the schedule", async () => {
    seed();
    emailMock.sendEmail.mockRejectedValue(new Error("no key"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await clerk.scheduleClerkBooking({
      adminId: ADMIN,
      bookingId: BOOKING,
      scheduledFor: new Date(Date.now() + DAY),
      meetingDetails: "We call the number on your account.",
    });

    expect(res.emailSent).toBe(false);
    expect(state.bookings.get(BOOKING)?.status).toBe("scheduled");
    log.mockRestore();
  });

  it("refuses a time after the window, before the hold is authorized, or on a closed booking", async () => {
    seed();
    await expect(
      clerk.scheduleClerkBooking({
        adminId: ADMIN,
        bookingId: BOOKING,
        scheduledFor: new Date(Date.now() + 6 * DAY + HOUR),
        meetingDetails: "x",
      }),
    ).rejects.toMatchObject({ kind: "bad_request", message: expect.stringContaining("has to start by") });

    seed({ authorized_at: null, hold_expires_at: null });
    await expect(
      clerk.scheduleClerkBooking({
        adminId: ADMIN,
        bookingId: BOOKING,
        scheduledFor: new Date(Date.now() + DAY),
        meetingDetails: "x",
      }),
    ).rejects.toMatchObject({ kind: "bad_request" });

    seed({ status: "completed", scheduled_for: new Date(), hours_used: 1, amount_captured_cents: "8000" });
    await expect(
      clerk.scheduleClerkBooking({
        adminId: ADMIN,
        bookingId: BOOKING,
        scheduledFor: new Date(Date.now() + DAY),
        meetingDetails: "x",
      }),
    ).rejects.toMatchObject({ kind: "invalid_transition" });
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("reschedules a scheduled booking", async () => {
    seed({ status: "scheduled", scheduled_for: new Date(Date.now() + DAY), meeting_details: "old" });
    const res = await clerk.scheduleClerkBooking({
      adminId: ADMIN,
      bookingId: BOOKING,
      scheduledFor: new Date(Date.now() + 2 * DAY),
      meetingDetails: "new",
    });
    expect(res.booking.meeting_details).toBe("new");
    expect(auditActions()).toEqual(["clerk.booking.rescheduled"]);
    expect(sentSubjects()).toEqual(["Gideon Clerk: your session has a new time"]);
  });
});

describe("completeClerkBooking", () => {
  const started = () => seed({ status: "scheduled", scheduled_for: new Date(Date.now() - HOUR), meeting_details: "x" });

  it("captures only the hours used and releases the rest", async () => {
    started();
    const booking = await clerk.completeClerkBooking({ adminId: ADMIN, bookingId: BOOKING, hoursUsed: 2 });

    expect(paymentsMock.captureClerkHold).toHaveBeenCalledWith("pi_clerk", 16_000);
    expect(booking).toMatchObject({ status: "completed", hours_used: 2, amount_captured_cents: 16_000 });
    const newValue = (audit.logAudit.mock.calls[0] as unknown[])[5];
    expect(newValue).toMatchObject({ amount_captured_cents: 16_000, amount_released_cents: 8000 });
    expect(sentSubjects()).toEqual(["Gideon Clerk: your session is complete"]);
  });

  it("never captures more than the hours booked", async () => {
    started();
    await expect(
      clerk.completeClerkBooking({ adminId: ADMIN, bookingId: BOOKING, hoursUsed: 4 }),
    ).rejects.toMatchObject({ kind: "bad_request" });
    expect(paymentsMock.captureClerkHold).not.toHaveBeenCalled();
    expect(state.bookings.get(BOOKING)?.status).toBe("scheduled");
  });

  it("can't complete before the session starts, or a booking that isn't scheduled", async () => {
    seed({ status: "scheduled", scheduled_for: new Date(Date.now() + HOUR), meeting_details: "x" });
    await expect(
      clerk.completeClerkBooking({ adminId: ADMIN, bookingId: BOOKING, hoursUsed: 1 }),
    ).rejects.toMatchObject({ kind: "invalid_transition" });

    seed();
    await expect(
      clerk.completeClerkBooking({ adminId: ADMIN, bookingId: BOOKING, hoursUsed: 1 }),
    ).rejects.toMatchObject({ kind: "invalid_transition" });
    expect(paymentsMock.captureClerkHold).not.toHaveBeenCalled();
  });

  it("leaves the booking scheduled when the capture fails", async () => {
    started();
    paymentsMock.captureClerkHold.mockRejectedValue(
      Object.assign(new Error("The hold on the customer's card has lapsed"), { kind: "payment_error" }),
    );
    await expect(
      clerk.completeClerkBooking({ adminId: ADMIN, bookingId: BOOKING, hoursUsed: 1 }),
    ).rejects.toThrow("lapsed");
    expect(state.bookings.get(BOOKING)?.status).toBe("scheduled");
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });
});

describe("cancelClerkBooking", () => {
  it("lets the customer cancel before the session and releases the hold", async () => {
    seed({ status: "scheduled", scheduled_for: new Date(Date.now() + DAY), meeting_details: "x" });

    const booking = await clerk.cancelClerkBooking({ actorId: CUSTOMER, bookingId: BOOKING, asAdmin: false });

    expect(paymentsMock.releaseClerkHold).toHaveBeenCalledWith("pi_clerk");
    expect(booking).toMatchObject({ status: "cancelled", cancel_reason: "You cancelled it." });
    expect(sentSubjects()).toEqual([
      "Gideon Clerk: your booking is cancelled",
      "Gideon Clerk booking cancelled by the customer",
    ]);
  });

  it("doesn't let the customer cancel once the session has started", async () => {
    seed({ status: "scheduled", scheduled_for: new Date(Date.now() - 60_000), meeting_details: "x" });
    await expect(
      clerk.cancelClerkBooking({ actorId: CUSTOMER, bookingId: BOOKING, asAdmin: false }),
    ).rejects.toMatchObject({ kind: "forbidden", message: clerk.CLERK_SESSION_STARTED });
    expect(paymentsMock.releaseClerkHold).not.toHaveBeenCalled();
  });

  it("lets an admin cancel with a reason the customer sees", async () => {
    seed({ status: "scheduled", scheduled_for: new Date(Date.now() - 60_000), meeting_details: "x" });
    await expect(
      clerk.cancelClerkBooking({ actorId: ADMIN, bookingId: BOOKING, asAdmin: true, reason: " " }),
    ).rejects.toMatchObject({ kind: "bad_request" });

    const booking = await clerk.cancelClerkBooking({
      actorId: ADMIN,
      bookingId: BOOKING,
      asAdmin: true,
      reason: "Gideon Clerk can't help with tax matters.",
    });
    expect(booking.cancel_reason).toBe("Gideon Clerk can't help with tax matters.");
    expect(paymentsMock.releaseClerkHold).toHaveBeenCalledWith("pi_clerk");
    expect(sentSubjects()).toEqual(["Gideon Clerk: your booking is cancelled"]);
  });

  it("can't cancel a completed booking", async () => {
    seed({ status: "completed", scheduled_for: new Date(), hours_used: 1, amount_captured_cents: "8000" });
    await expect(
      clerk.cancelClerkBooking({ actorId: ADMIN, bookingId: BOOKING, asAdmin: true, reason: "x" }),
    ).rejects.toMatchObject({ kind: "invalid_transition" });
    expect(paymentsMock.releaseClerkHold).not.toHaveBeenCalled();
  });

  it("only lets a customer cancel their own booking", async () => {
    seed();
    await expect(
      clerk.cancelClerkBooking({ actorId: ADMIN, bookingId: BOOKING, asAdmin: false }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});
