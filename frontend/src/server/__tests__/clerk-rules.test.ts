import { describe, it, expect } from "vitest";
import {
  CLERK_HOLD_DAYS,
  CLERK_HOURLY_CENTS,
  CLERK_MAX_HOURS,
  CLERK_SESSION_WINDOW_DAYS,
  canClerkTransition,
  clerkAmountCents,
  clerkCapturePlan,
  clerkCompleteProblem,
  clerkHoldExpiresAt,
  clerkLoginSafety,
  clerkScheduleProblem,
  customerMayCancel,
  formatClerkTime,
  formatWholeDollars,
  isClerkTimeZone,
  isValidClerkHours,
  latestClerkSessionStart,
  type ClerkStatus,
} from "../clerk-rules";
import { calculateFees } from "../fees";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const AUTHORIZED = new Date("2026-11-23T15:00:00Z");

describe("Gideon Clerk price", () => {
  it("is $80 an hour", () => {
    expect(CLERK_HOURLY_CENTS).toBe(8000);
    expect(formatWholeDollars(CLERK_HOURLY_CENTS)).toBe("$80");
  });

  it("charges exactly hours × the rate, for 1 to 4 whole hours", () => {
    expect(clerkAmountCents(1)).toBe(8000);
    expect(clerkAmountCents(2)).toBe(16_000);
    expect(clerkAmountCents(3)).toBe(24_000);
    expect(clerkAmountCents(4)).toBe(32_000);
    for (let h = 1; h <= CLERK_MAX_HOURS; h++) {
      expect(clerkAmountCents(h)).toBe(h * CLERK_HOURLY_CENTS);
    }
  });

  it("caps a booking at 4 hours and refuses part hours", () => {
    expect(CLERK_MAX_HOURS).toBe(4);
    for (const bad of [0, -1, 5, 10, 1.5, Number.NaN]) {
      expect(isValidClerkHours(bad)).toBe(false);
      expect(() => clerkAmountCents(bad)).toThrow(RangeError);
    }
  });

  it("adds no Gideon Tasks fee and no Stripe fee, unlike a task", () => {
    const hours = 2;
    const clerk = clerkAmountCents(hours);
    expect(clerk).toBe(16_000);
    // The same anchor as a task would cost the requester more: the
    // marketplace adds its fee and grosses up for Stripe. Gideon Clerk doesn't.
    const task = calculateFees(clerk, "doer_receives", 500);
    expect(task.total_charged_cents).toBeGreaterThan(clerk);
    expect(clerk).toBe(task.anchor_cents);
  });
});

describe("clerkCapturePlan", () => {
  const booked = { hoursBooked: 3, amountAuthorizedCents: 24_000 };

  it("captures only the whole hours used", () => {
    expect(clerkCapturePlan({ ...booked, hoursUsed: 1 })).toEqual({ ok: true, cents: 8000 });
    expect(clerkCapturePlan({ ...booked, hoursUsed: 2 })).toEqual({ ok: true, cents: 16_000 });
    expect(clerkCapturePlan({ ...booked, hoursUsed: 3 })).toEqual({ ok: true, cents: 24_000 });
  });

  it("never captures more than the hours booked", () => {
    const plan = clerkCapturePlan({ ...booked, hoursUsed: 4 });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toContain("booked 3 hours");
  });

  it("never captures more than the authorization", () => {
    // A row whose authorization is below hours × rate (it can't be created
    // that way, but the check doesn't rely on that).
    const plan = clerkCapturePlan({ hoursBooked: 3, amountAuthorizedCents: 15_999, hoursUsed: 2 });
    expect(plan.ok).toBe(false);
  });

  it("refuses zero, negative and part hours", () => {
    for (const hoursUsed of [0, -1, 1.5]) {
      expect(clerkCapturePlan({ ...booked, hoursUsed }).ok).toBe(false);
    }
  });

  it("never exceeds the authorization for any booking", () => {
    for (let hoursBooked = 1; hoursBooked <= CLERK_MAX_HOURS; hoursBooked++) {
      const amountAuthorizedCents = clerkAmountCents(hoursBooked);
      for (let hoursUsed = 0; hoursUsed <= CLERK_MAX_HOURS + 1; hoursUsed++) {
        const plan = clerkCapturePlan({ hoursBooked, amountAuthorizedCents, hoursUsed });
        if (plan.ok) {
          expect(plan.cents).toBeLessThanOrEqual(amountAuthorizedCents);
          expect(hoursUsed).toBeLessThanOrEqual(hoursBooked);
        } else {
          expect(hoursUsed === 0 || hoursUsed > hoursBooked).toBe(true);
        }
      }
    }
  });
});

describe("booking states", () => {
  const all: ClerkStatus[] = ["requested", "scheduled", "completed", "cancelled"];
  const allowed = new Set([
    "requested>scheduled",
    "requested>cancelled",
    "scheduled>scheduled",
    "scheduled>completed",
    "scheduled>cancelled",
  ]);

  it("allows exactly requested → scheduled → completed, rescheduling, and cancelling an open booking", () => {
    for (const from of all) {
      for (const to of all) {
        expect(canClerkTransition(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  it("lets nothing leave completed or cancelled", () => {
    for (const to of all) {
      expect(canClerkTransition("completed", to)).toBe(false);
      expect(canClerkTransition("cancelled", to)).toBe(false);
    }
  });

  it("can't complete straight from requested", () => {
    expect(canClerkTransition("requested", "completed")).toBe(false);
    expect(
      clerkCompleteProblem({ status: "requested", scheduledFor: null, now: AUTHORIZED }),
    ).toContain("Only a scheduled booking");
  });

  it("can't complete a session before it starts", () => {
    const start = new Date(AUTHORIZED.getTime() + DAY);
    expect(
      clerkCompleteProblem({ status: "scheduled", scheduledFor: start, now: AUTHORIZED }),
    ).toContain("hasn't started");
    expect(
      clerkCompleteProblem({ status: "scheduled", scheduledFor: start, now: new Date(start.getTime() + HOUR) }),
    ).toBeNull();
  });
});

describe("customerMayCancel", () => {
  const start = new Date(AUTHORIZED.getTime() + DAY);

  it("allows a requested booking at any time", () => {
    expect(customerMayCancel({ status: "requested", scheduled_for: null }, AUTHORIZED)).toBe(true);
  });

  it("allows a scheduled booking only before the session starts", () => {
    const b = { status: "scheduled" as const, scheduled_for: start.toISOString() };
    expect(customerMayCancel(b, new Date(start.getTime() - 1))).toBe(true);
    expect(customerMayCancel(b, start)).toBe(false);
    expect(customerMayCancel(b, new Date(start.getTime() + HOUR))).toBe(false);
  });

  it("refuses completed and cancelled bookings", () => {
    expect(customerMayCancel({ status: "completed", scheduled_for: start }, AUTHORIZED)).toBe(false);
    expect(customerMayCancel({ status: "cancelled", scheduled_for: null }, AUTHORIZED)).toBe(false);
  });
});

describe("the hold window", () => {
  it("uses Stripe's capture_before when the charge has one", () => {
    const captureBefore = Math.floor(AUTHORIZED.getTime() / 1000) + 5 * 24 * 3600;
    expect(clerkHoldExpiresAt(captureBefore, AUTHORIZED).getTime()).toBe(AUTHORIZED.getTime() + 5 * DAY);
  });

  it("falls back to 7 days after authorization", () => {
    expect(CLERK_HOLD_DAYS).toBe(7);
    expect(clerkHoldExpiresAt(null, AUTHORIZED).getTime()).toBe(AUTHORIZED.getTime() + 7 * DAY);
    expect(clerkHoldExpiresAt(undefined, AUTHORIZED).getTime()).toBe(AUTHORIZED.getTime() + 7 * DAY);
  });

  it("makes a session end a day before the hold lapses", () => {
    const expires = clerkHoldExpiresAt(null, AUTHORIZED);
    expect(CLERK_SESSION_WINDOW_DAYS).toBe(6);
    // 4 hours booked: start by 7 days − 24 hours − 4 hours.
    expect(latestClerkSessionStart(expires, 4).getTime()).toBe(AUTHORIZED.getTime() + 6 * DAY - 4 * HOUR);
    expect(latestClerkSessionStart(expires, 1).getTime()).toBe(AUTHORIZED.getTime() + 6 * DAY - HOUR);
  });

  it("schedules only in the future and inside the window", () => {
    const expires = clerkHoldExpiresAt(null, AUTHORIZED);
    const now = new Date(AUTHORIZED.getTime() + HOUR);
    const base = { now, holdExpiresAt: expires, hoursBooked: 2 };
    expect(clerkScheduleProblem({ ...base, scheduledFor: new Date(now.getTime() + DAY) })).toBeNull();
    expect(
      clerkScheduleProblem({ ...base, scheduledFor: new Date(AUTHORIZED.getTime() + 6 * DAY - 2 * HOUR) }),
    ).toBeNull();
    expect(
      clerkScheduleProblem({ ...base, scheduledFor: new Date(AUTHORIZED.getTime() + 6 * DAY - 2 * HOUR + 1) }),
    ).toContain("has to start by");
    expect(clerkScheduleProblem({ ...base, scheduledFor: new Date(now.getTime() - 1) })).toContain("future");
    expect(clerkScheduleProblem({ ...base, scheduledFor: new Date("not a date") })).toContain("valid");
  });

  it("can't schedule before the hold is authorized", () => {
    expect(
      clerkScheduleProblem({
        scheduledFor: new Date(AUTHORIZED.getTime() + DAY),
        now: AUTHORIZED,
        holdExpiresAt: null,
        hoursBooked: 1,
      }),
    ).toContain("isn't authorized");
  });
});

describe("time zones and copy", () => {
  it("offers US time zones only", () => {
    expect(isClerkTimeZone("America/Chicago")).toBe(true);
    expect(isClerkTimeZone("Pacific/Honolulu")).toBe(true);
    expect(isClerkTimeZone("Europe/London")).toBe(false);
    expect(isClerkTimeZone("")).toBe(false);
  });

  it("formats a session time in the customer's zone", () => {
    const s = formatClerkTime("2026-11-24T20:00:00Z", "America/Chicago");
    expect(s).toContain("November 24, 2026");
    expect(s).toContain("2:00");
    expect(s).toContain("CST");
  });

  it("states the three login-safety rules", () => {
    const rules = clerkLoginSafety();
    expect(rules).toHaveLength(3);
    expect(rules[0]).toContain("passwords, security answers or one-time codes");
    expect(rules[1]).toContain("never take control of your device");
    expect(rules[2]).toContain("gift card, wire, crypto");
    expect(rules[2]).toContain("off this site");
    expect(clerkLoginSafety("Gideon Tasks")[2]).toContain("off Gideon Tasks");
  });
});
