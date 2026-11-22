// Gideon Clerk rules: the price, the booking cap, the hold window and the
// booking states. Gideon Clerk is a service Gideon Solutions, LLC (the
// company that runs Gideon Tasks) offers itself: it is not a task, has no
// tasker and pays no Gideon Tasks fee. Keep this module free of server-only
// imports, so the pages show the same numbers the API enforces.

/** The hourly rate, all-in: what the customer pays for one hour. */
export const CLERK_HOURLY_CENTS = 8000;

/** One booking is 1 to 4 whole hours. */
export const CLERK_MIN_HOURS = 1;
export const CLERK_MAX_HOURS = 4;

/**
 * How long Stripe keeps an uncaptured card hold when the charge doesn't say
 * (`capture_before` on the card details). Stripe's default window for online
 * card payments is 7 days; after it, the hold is released and nothing can be
 * captured.
 */
export const CLERK_HOLD_DAYS = 7;

/**
 * A session has to end this long before the hold lapses, so there is time to
 * record the hours used and capture them.
 */
export const CLERK_RECORD_MARGIN_HOURS = 24;

/** The booking description: long enough to act on, short enough to read. */
export const CLERK_DESCRIPTION_MIN = 30;
export const CLERK_DESCRIPTION_MAX = 2000;

/** The meeting details an admin emails: a video link, or how the call works. */
export const CLERK_MEETING_DETAILS_MAX = 1000;

/** Online only for now. In person is not offered yet. */
export const CLERK_SESSION_TYPES = ["video", "phone"] as const;
export type ClerkSessionType = (typeof CLERK_SESSION_TYPES)[number];

export const CLERK_SESSION_TYPE_LABELS: Readonly<Record<ClerkSessionType, string>> = {
  video: "Video call with screen share",
  phone: "Phone call",
};

export type ClerkStatus = "requested" | "scheduled" | "completed" | "cancelled";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ─── Price ───────────────────────────────────────────────

export function isValidClerkHours(hours: number): boolean {
  return Number.isInteger(hours) && hours >= CLERK_MIN_HOURS && hours <= CLERK_MAX_HOURS;
}

/**
 * What a booking costs: hours × the hourly rate, and nothing else. No Gideon
 * Tasks fee and no Stripe fee is added (Gideon Solutions pays Stripe's fee
 * out of the rate).
 */
export function clerkAmountCents(hours: number): number {
  if (!isValidClerkHours(hours)) {
    throw new RangeError(
      `A Gideon Clerk booking is ${CLERK_MIN_HOURS} to ${CLERK_MAX_HOURS} whole hours.`,
    );
  }
  return hours * CLERK_HOURLY_CENTS;
}

/** "$80" for 8000 cents; whole dollars only, which the rate is. */
export function formatWholeDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function formatHours(hours: number): string {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

// ─── Capture ─────────────────────────────────────────────

export type CapturePlan = { ok: true; cents: number } | { ok: false; reason: string };

/**
 * The amount to capture after a session: the whole hours used × the rate.
 * It can never be more than the hours booked or the amount authorized; the
 * rest of the hold is released.
 */
export function clerkCapturePlan(a: {
  hoursUsed: number;
  hoursBooked: number;
  amountAuthorizedCents: number;
}): CapturePlan {
  if (!Number.isInteger(a.hoursUsed) || a.hoursUsed < 1) {
    return {
      ok: false,
      reason: "Record at least 1 whole hour. If the session didn't happen, cancel the booking instead.",
    };
  }
  if (a.hoursUsed > a.hoursBooked) {
    return {
      ok: false,
      reason: `The customer booked ${formatHours(a.hoursBooked)}, so no more than that can be charged.`,
    };
  }
  const cents = a.hoursUsed * CLERK_HOURLY_CENTS;
  if (cents > a.amountAuthorizedCents) {
    return { ok: false, reason: "That is more than the hold on the customer's card." };
  }
  return { ok: true, cents };
}

// ─── States ──────────────────────────────────────────────
//
//   requested ──► scheduled ──► completed
//       │             │ ▲
//       │             └─┘ (rescheduled)
//       └─────────────┴──────► cancelled
//
// A requested booking whose card hold is not authorized yet (the bank's
// 3-D Secure check is unfinished) can only be cancelled.

const TRANSITIONS: Readonly<Record<ClerkStatus, readonly ClerkStatus[]>> = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["scheduled", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canClerkTransition(from: ClerkStatus, to: ClerkStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses an open booking can be in (one open booking per customer). */
export const CLERK_OPEN_STATUSES: readonly ClerkStatus[] = ["requested", "scheduled"];

/**
 * The customer can cancel until the session starts: a requested booking at
 * any time, a scheduled one before its start time. After that, the session
 * is recorded or cancelled by Gideon Clerk.
 */
export function customerMayCancel(
  b: { status: ClerkStatus; scheduled_for: Date | string | null },
  now: Date,
): boolean {
  if (b.status === "requested") return true;
  if (b.status !== "scheduled" || !b.scheduled_for) return false;
  return now.getTime() < new Date(b.scheduled_for).getTime();
}

// ─── Scheduling window ───────────────────────────────────

/**
 * When the card hold lapses: Stripe's `capture_before` (Unix seconds) when
 * the charge reports it, or else CLERK_HOLD_DAYS after it was authorized.
 */
export function clerkHoldExpiresAt(
  captureBeforeUnix: number | null | undefined,
  authorizedAt: Date,
): Date {
  if (typeof captureBeforeUnix === "number" && captureBeforeUnix > 0) {
    return new Date(captureBeforeUnix * 1000);
  }
  return new Date(authorizedAt.getTime() + CLERK_HOLD_DAYS * DAY_MS);
}

/**
 * The latest a session can start: it must end (after all the hours booked)
 * CLERK_RECORD_MARGIN_HOURS before the hold lapses.
 */
export function latestClerkSessionStart(holdExpiresAt: Date, hoursBooked: number): Date {
  return new Date(
    holdExpiresAt.getTime() - (CLERK_RECORD_MARGIN_HOURS + hoursBooked) * HOUR_MS,
  );
}

/** Why a session can't be scheduled at this time, or null if it can. */
export function clerkScheduleProblem(a: {
  scheduledFor: Date;
  now: Date;
  holdExpiresAt: Date | null;
  hoursBooked: number;
}): string | null {
  if (Number.isNaN(a.scheduledFor.getTime())) return "Enter a valid date and time.";
  if (!a.holdExpiresAt) {
    return "The customer's card hold isn't authorized yet, so this booking can't be scheduled.";
  }
  if (a.scheduledFor.getTime() <= a.now.getTime()) {
    return "Pick a time in the future.";
  }
  const latest = latestClerkSessionStart(a.holdExpiresAt, a.hoursBooked);
  if (a.scheduledFor.getTime() > latest.getTime()) {
    return `The session has to start by ${latest.toISOString()} (UTC), so it ends a day before the card hold lapses. If no time works, cancel the booking to release the hold.`;
  }
  return null;
}

/** Why a session can't be recorded as completed yet, or null if it can. */
export function clerkCompleteProblem(a: {
  status: ClerkStatus;
  scheduledFor: Date | string | null;
  now: Date;
}): string | null {
  if (a.status !== "scheduled" || !a.scheduledFor) {
    return "Only a scheduled booking can be completed.";
  }
  if (a.now.getTime() < new Date(a.scheduledFor).getTime()) {
    return "This session hasn't started yet. Record the hours after it.";
  }
  return null;
}

// ─── Time zones ──────────────────────────────────────────

/** US time zones offered in the booking form (IANA names). */
export const CLERK_TIME_ZONES: readonly { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico, U.S. Virgin Islands)" },
  { value: "Pacific/Guam", label: "Chamorro (Guam, Northern Mariana Islands)" },
  { value: "Pacific/Pago_Pago", label: "Samoa (American Samoa)" },
];

export function isClerkTimeZone(tz: string): boolean {
  return CLERK_TIME_ZONES.some((z) => z.value === tz);
}

/** A session time as the customer reads it, e.g. "Tuesday, November 24, 2026 at 2:00 PM CST". */
export function formatClerkTime(when: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(when));
}

// ─── Copy that must say the same thing everywhere ────────

/** Days a session can end within, counted from booking, when the hold lasts CLERK_HOLD_DAYS. */
export const CLERK_SESSION_WINDOW_DAYS = CLERK_HOLD_DAYS - CLERK_RECORD_MARGIN_HOURS / 24;

/**
 * The login-safety rules, shown on the Gideon Clerk page, in the booking
 * form and in every Gideon Clerk email. They are also anti-scam guidance:
 * tech-support scams ask for exactly these things.
 */
export function clerkLoginSafety(where = "this site"): string[] {
  return [
    "Gideon Clerk never asks for, types, receives or stores your passwords, security answers or one-time codes. You type them yourself while we guide you.",
    "We never take control of your device. Any screen share is your choice, and you can stop it at any time.",
    `We never contact you first unless you booked, and we never ask for payment by gift card, wire, crypto or anything off ${where}.`,
  ];
}
