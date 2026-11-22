import "server-only";
import { execute, query, queryOne } from "./db";
import { newId } from "./auth";
import { logAudit } from "./audit";
import { siteUrl } from "./env";
import {
  badRequest,
  conflict,
  contentRejected,
  forbidden,
  invalidTransition,
  notFound,
  paymentError,
} from "./errors";
import { moderateClerkDescription } from "./clerk-moderation";
import {
  CLERK_DESCRIPTION_MAX,
  CLERK_DESCRIPTION_MIN,
  CLERK_MAX_HOURS,
  CLERK_MEETING_DETAILS_MAX,
  CLERK_MIN_HOURS,
  canClerkTransition,
  clerkAmountCents,
  clerkCapturePlan,
  clerkCompleteProblem,
  clerkHoldExpiresAt,
  clerkScheduleProblem,
  customerMayCancel,
  formatClerkTime,
  isClerkTimeZone,
  isValidClerkHours,
  latestClerkSessionStart,
  type ClerkSessionType,
  type ClerkStatus,
} from "./clerk-rules";
import {
  authorizeClerkHold,
  captureClerkHold,
  releaseClerkHold,
  retrieveClerkIntent,
  type ClerkIntent,
} from "./payments";
import { MESSAGES, isCancelable } from "./payment-rules";
import {
  clerkAdminCancelNoticeEmail,
  clerkAdminNoticeEmail,
  clerkBookedEmail,
  clerkCancelledEmail,
  clerkCompletedEmail,
  clerkScheduledEmail,
  sendClerkEmails,
} from "./clerk-emails";
import type { EmailMessage } from "./email";

/**
 * Gideon Clerk bookings: help with paperwork and online accounts, sold by
 * Gideon Solutions, LLC itself at CLERK_HOURLY_CENTS an hour. Bookings live
 * in their own table (clerk_bookings), never in tasks, so Gideon Clerk is
 * not in the task feed, the categories or anyone's ranking, and its
 * payments don't count toward the marketplace fee volume.
 *
 *  1. Booking places a manual-capture hold for hours × the rate on the
 *     customer's saved card (3-D Secure in the browser, as for tasks).
 *  2. An admin schedules the session to end a day before the hold lapses
 *     (Stripe's window is up to 7 days), and the meeting details are
 *     emailed to the customer's verified address.
 *  3. After the session, the admin records the whole hours used and only
 *     those are captured; Stripe releases the rest. Cancelling before then
 *     releases the hold and nothing is charged.
 *
 * Every change is in audit_log. Emails go out after the change is saved and
 * a failed email never undoes it.
 */

export const CLERK_BOOKINGS_PATH = "/clerk/bookings";
export const CLERK_ADMIN_PATH = "/admin/clerk";

type Stamp = Date | string | null;

interface BookingRow {
  id: string;
  user_id: string;
  hours_booked: number;
  hours_used: number | null;
  amount_authorized_cents: number | string;
  amount_captured_cents: number | string | null;
  status: ClerkStatus;
  session_type: ClerkSessionType;
  time_zone: string;
  description: string;
  moderation_note: string | null;
  payment_intent_id: string | null;
  authorized_at: Stamp;
  hold_expires_at: Stamp;
  scheduled_for: Stamp;
  meeting_details: string | null;
  cancel_reason: string | null;
  created_at: Stamp;
  completed_at: Stamp;
  cancelled_at: Stamp;
}

const COLUMN_NAMES = [
  "id",
  "user_id",
  "hours_booked",
  "hours_used",
  "amount_authorized_cents",
  "amount_captured_cents",
  "status",
  "session_type",
  "time_zone",
  "description",
  "moderation_note",
  "payment_intent_id",
  "authorized_at",
  "hold_expires_at",
  "scheduled_for",
  "meeting_details",
  "cancel_reason",
  "created_at",
  "completed_at",
  "cancelled_at",
];
const COLUMNS = COLUMN_NAMES.join(", ");
const B_COLUMNS = COLUMN_NAMES.map((c) => `b.${c}`).join(", ");

const iso = (v: Stamp): string | null => (v == null ? null : new Date(v).toISOString());
const date = (v: Stamp): Date | null => (v == null ? null : new Date(v));
/** BIGINT columns arrive from the Neon driver as strings. */
const cents = (v: number | string | null): number | null => (v == null ? null : Number(v));

/** A booking as its customer sees it. */
export interface ClerkBooking {
  id: string;
  status: ClerkStatus;
  hours_booked: number;
  hours_used: number | null;
  amount_authorized_cents: number;
  amount_captured_cents: number | null;
  session_type: ClerkSessionType;
  time_zone: string;
  description: string;
  /** The card hold is authorized (false while the bank's 3-D Secure check is unfinished). */
  hold_authorized: boolean;
  hold_expires_at: string | null;
  scheduled_for: string | null;
  meeting_details: string | null;
  cancel_reason: string | null;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  customer_may_cancel: boolean;
}

/** A booking as an admin sees it, with the customer's contact details. */
export interface ClerkAdminBooking extends ClerkBooking {
  user_id: string;
  moderation_note: string | null;
  payment_intent_id: string | null;
  /** The latest the session can start and still be recorded before the hold lapses. */
  latest_session_start: string | null;
  /** When the list was read: the hold's lapse time has passed, or the session's start has. */
  hold_lapsed: boolean;
  session_started: boolean;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
}

function toBooking(row: BookingRow, now = new Date()): ClerkBooking {
  return {
    id: row.id,
    status: row.status,
    hours_booked: Number(row.hours_booked),
    hours_used: row.hours_used == null ? null : Number(row.hours_used),
    amount_authorized_cents: Number(row.amount_authorized_cents),
    amount_captured_cents: cents(row.amount_captured_cents),
    session_type: row.session_type,
    time_zone: row.time_zone,
    description: row.description,
    hold_authorized: row.authorized_at != null,
    hold_expires_at: iso(row.hold_expires_at),
    scheduled_for: iso(row.scheduled_for),
    meeting_details: row.meeting_details,
    cancel_reason: row.cancel_reason,
    created_at: iso(row.created_at) ?? new Date(0).toISOString(),
    completed_at: iso(row.completed_at),
    cancelled_at: iso(row.cancelled_at),
    customer_may_cancel: customerMayCancel(row, now),
  };
}

type AdminRow = BookingRow & {
  legal_first_name: string;
  legal_last_name: string;
  email: string;
  phone: string;
};

function toAdminBooking(row: AdminRow, now = new Date()): ClerkAdminBooking {
  const expires = date(row.hold_expires_at);
  const start = date(row.scheduled_for);
  return {
    ...toBooking(row, now),
    user_id: row.user_id,
    moderation_note: row.moderation_note,
    payment_intent_id: row.payment_intent_id,
    latest_session_start: expires
      ? latestClerkSessionStart(expires, Number(row.hours_booked)).toISOString()
      : null,
    hold_lapsed: expires != null && now.getTime() >= expires.getTime(),
    session_started: start != null && now.getTime() >= start.getTime(),
    customer_name: `${row.legal_first_name} ${row.legal_last_name}`.trim(),
    customer_email: row.email,
    customer_phone: row.phone,
  };
}

async function findBooking(id: string): Promise<BookingRow | null> {
  return queryOne<BookingRow>(`SELECT ${COLUMNS} FROM clerk_bookings WHERE id = $1`, [id]);
}

async function fetchBooking(id: string): Promise<BookingRow> {
  const row = await findBooking(id);
  if (!row) throw notFound("Booking not found");
  return row;
}

async function fetchOwnBooking(userId: string, id: string): Promise<BookingRow> {
  const row = await findBooking(id);
  if (!row || row.user_id !== userId) throw notFound("Booking not found");
  return row;
}

async function fetchAdminBooking(id: string): Promise<ClerkAdminBooking> {
  const row = await queryOne<AdminRow>(
    `SELECT ${B_COLUMNS}, u.legal_first_name, u.legal_last_name, u.email, u.phone
     FROM clerk_bookings b JOIN users u ON u.id = b.user_id
     WHERE b.id = $1`,
    [id],
  );
  if (!row) throw notFound("Booking not found");
  return toAdminBooking(row);
}

export async function listCustomerBookings(userId: string): Promise<ClerkBooking[]> {
  const rows = await query<BookingRow>(
    `SELECT ${COLUMNS} FROM clerk_bookings WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  const now = new Date();
  return rows.map((r) => toBooking(r, now));
}

export async function listAdminBookings(scope: "open" | "all"): Promise<ClerkAdminBooking[]> {
  const rows = await query<AdminRow>(
    `SELECT ${B_COLUMNS}, u.legal_first_name, u.legal_last_name, u.email, u.phone
     FROM clerk_bookings b JOIN users u ON u.id = b.user_id
     WHERE $1 = 'all' OR b.status IN ('requested', 'scheduled')
     ORDER BY b.created_at DESC LIMIT 200`,
    [scope],
  );
  const now = new Date();
  return rows.map((r) => toAdminBooking(r, now));
}

// ─── Email helpers ───────────────────────────────────────

async function customerEmail(userId: string): Promise<string | null> {
  const row = await queryOne<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
  return row?.email ?? null;
}

/** Every active admin account gets the new-booking and cancellation notices. */
async function adminEmails(): Promise<string[]> {
  const rows = await query<{ email: string }>(
    `SELECT email FROM users WHERE is_admin = true AND status = 'active' ORDER BY created_at`,
  );
  return rows.map((r) => r.email);
}

const bookingsUrl = () => siteUrl(CLERK_BOOKINGS_PATH);
const adminUrl = () => siteUrl(CLERK_ADMIN_PATH);

// ─── Booking ─────────────────────────────────────────────

export const CLERK_ONE_OPEN_BOOKING =
  "You already have an open Gideon Clerk booking. Cancel it, or wait until it's done, to book another.";

export type ClerkBookingOutcome =
  | { status: "booked"; booking: ClerkBooking }
  | { status: "requires_action"; booking: ClerkBooking; clientSecret: string };

export interface CreateClerkBookingInput {
  userId: string;
  hours: number;
  sessionType: ClerkSessionType;
  timeZone: string;
  description: string;
}

/**
 * Books Gideon Clerk. The row is written first (status `requested`, hold not
 * authorized), so the hold's idempotency key and metadata can name it and
 * the Stripe webhook can always find it. The hold is then placed; a decline
 * or a Stripe error closes the row again, with nothing held.
 */
export async function createClerkBooking(input: CreateClerkBookingInput): Promise<ClerkBookingOutcome> {
  const user = await queryOne<{
    email_verified: boolean;
    status: string;
    stripe_customer_id: string | null;
    stripe_payment_method_id: string | null;
  }>(
    `SELECT email_verified, status, stripe_customer_id, stripe_payment_method_id
     FROM users WHERE id = $1`,
    [input.userId],
  );
  if (!user) throw notFound("User not found");
  if (user.status !== "active") throw forbidden("This account can't book Gideon Clerk right now.");
  if (!user.email_verified) {
    throw forbidden(
      "Confirm your email address before booking Gideon Clerk: we send your session details to it. Open the link we emailed you, or ask for a new one from your dashboard.",
    );
  }
  if (!user.stripe_customer_id || !user.stripe_payment_method_id) {
    throw paymentError(MESSAGES.clerkNoCard);
  }
  if (!isValidClerkHours(input.hours)) {
    throw badRequest(`Book ${CLERK_MIN_HOURS} to ${CLERK_MAX_HOURS} whole hours.`);
  }
  if (!isClerkTimeZone(input.timeZone)) throw badRequest("Choose your time zone.");

  const description = input.description.trim();
  if (description.length < CLERK_DESCRIPTION_MIN || description.length > CLERK_DESCRIPTION_MAX) {
    throw badRequest(
      `Describe what you need help with in ${CLERK_DESCRIPTION_MIN} to ${CLERK_DESCRIPTION_MAX} characters.`,
    );
  }
  const verdict = moderateClerkDescription(description);
  if (verdict.kind === "rejected") throw contentRejected(verdict.reason);
  // A flagged description is still booked: an admin reads every booking
  // before scheduling it, and sees the flag.
  const moderationNote = verdict.kind === "flagged" ? verdict.reason : null;

  const open = await queryOne<{ id: string }>(
    `SELECT id FROM clerk_bookings
     WHERE user_id = $1 AND status IN ('requested', 'scheduled') LIMIT 1`,
    [input.userId],
  );
  if (open) throw conflict(CLERK_ONE_OPEN_BOOKING);

  const id = newId();
  const amountCents = clerkAmountCents(input.hours);
  try {
    await execute(
      `INSERT INTO clerk_bookings
         (id, user_id, hours_booked, amount_authorized_cents, status, session_type,
          time_zone, description, moderation_note, created_at)
       VALUES ($1, $2, $3, $4, 'requested', $5, $6, $7, $8, now())`,
      [id, input.userId, input.hours, amountCents, input.sessionType, input.timeZone, description, moderationNote],
    );
  } catch (e) {
    // The one-open-booking index (clerk_bookings_one_open_per_user) caught a
    // second booking made at the same moment.
    if ((e as { code?: string }).code === "23505") throw conflict(CLERK_ONE_OPEN_BOOKING);
    throw e;
  }
  await logAudit(input.userId, "clerk.booking.requested", "clerk_booking", id, null, {
    status: "requested",
    hours_booked: input.hours,
    amount_authorized_cents: amountCents,
    session_type: input.sessionType,
    moderation: verdict.kind,
  });

  let hold: Awaited<ReturnType<typeof authorizeClerkHold>>;
  try {
    hold = await authorizeClerkHold({ bookingId: id, userId: input.userId, hours: input.hours });
  } catch (e) {
    await closeUnheld(id, input.userId, "We couldn't reach the card processor, so nothing was held or charged.", null);
    throw e;
  }

  if (hold.status === "declined") {
    await closeUnheld(id, input.userId, "The card was declined, so nothing was held or charged.", hold.paymentIntentId);
    throw paymentError(hold.message);
  }
  if (hold.status === "requires_action") {
    await execute(
      `UPDATE clerk_bookings SET payment_intent_id = $1
       WHERE id = $2 AND payment_intent_id IS NULL`,
      [hold.intent.id, id],
    );
    return {
      status: "requires_action",
      booking: toBooking(await fetchBooking(id)),
      clientSecret: hold.clientSecret,
    };
  }

  await recordHoldAuthorized(id, hold.intent, input.userId);
  return { status: "booked", booking: toBooking(await fetchBooking(id)) };
}

/** Closes a booking whose hold never got authorized. Nothing is held. */
async function closeUnheld(
  id: string,
  actorId: string,
  reason: string,
  paymentIntentId: string | null,
): Promise<void> {
  const row = await queryOne<{ id: string }>(
    `UPDATE clerk_bookings
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = $1,
         payment_intent_id = COALESCE(payment_intent_id, $2)
     WHERE id = $3 AND status = 'requested' AND authorized_at IS NULL
     RETURNING id`,
    [reason, paymentIntentId, id],
  );
  if (row) {
    await logAudit(
      actorId,
      "clerk.booking.cancelled",
      "clerk_booking",
      id,
      { status: "requested" },
      { status: "cancelled", by: "card", reason, payment_intent_id: paymentIntentId },
    );
  }
}

/**
 * Marks the hold authorized. Shared by the booking request, the confirm call
 * after 3-D Secure and the Stripe webhook, so it is safe to call twice: only
 * the call that sets authorized_at writes the audit entry and sends the
 * booking emails. Returns true if this call did.
 */
async function recordHoldAuthorized(
  bookingId: string,
  intent: ClerkIntent,
  actorId: string,
): Promise<boolean> {
  const authorizedAt = new Date();
  const expires = clerkHoldExpiresAt(intent.captureBefore, authorizedAt);
  const row = await queryOne<BookingRow>(
    `UPDATE clerk_bookings
     SET payment_intent_id = $1, authorized_at = $2, hold_expires_at = $3
     WHERE id = $4 AND status = 'requested' AND authorized_at IS NULL
       AND (payment_intent_id IS NULL OR payment_intent_id = $1)
       AND amount_authorized_cents = $5
     RETURNING ${COLUMNS}`,
    [intent.id, authorizedAt, expires, bookingId, intent.amount],
  );
  if (!row) return false;

  await logAudit(
    actorId,
    "clerk.booking.hold_authorized",
    "clerk_booking",
    bookingId,
    { authorized: false },
    {
      authorized: true,
      payment_intent_id: intent.id,
      amount_authorized_cents: intent.amount,
      hold_expires_at: expires.toISOString(),
    },
  );

  const hours = Number(row.hours_booked);
  const amount = Number(row.amount_authorized_cents);
  const to = await customerEmail(row.user_id);
  const messages: EmailMessage[] = [];
  if (to) {
    messages.push(
      clerkBookedEmail(to, { hours, amountCents: amount, sessionType: row.session_type, bookingsUrl: bookingsUrl() }),
    );
  }
  const latest = latestClerkSessionStart(expires, hours).toISOString();
  for (const admin of await adminEmails()) {
    messages.push(
      clerkAdminNoticeEmail(admin, {
        hours,
        amountCents: amount,
        sessionType: row.session_type,
        latestStartUtc: latest,
        flagged: row.moderation_note != null,
        adminUrl: adminUrl(),
      }),
    );
  }
  await sendClerkEmails(messages);
  return true;
}

/**
 * Called by the browser after stripe.handleNextAction (3-D Secure). Stripe's
 * state decides: an authorized hold books the session, a check that is
 * still open is handed back, and anything else closes the booking.
 */
export async function confirmClerkHold(userId: string, bookingId: string): Promise<ClerkBookingOutcome> {
  const b = await fetchOwnBooking(userId, bookingId);
  if (b.authorized_at) return { status: "booked", booking: toBooking(b) };
  if (b.status !== "requested" || !b.payment_intent_id) {
    throw conflict("This booking is no longer waiting for your bank. Refresh the page.");
  }

  const intent = await retrieveClerkIntent(b.payment_intent_id);
  if (intent.bookingId !== b.id || intent.amount !== Number(b.amount_authorized_cents)) {
    throw conflict("This card hold doesn't match the booking. Refresh the page.");
  }
  if (intent.status === "requires_capture") {
    await recordHoldAuthorized(b.id, intent, userId);
    return { status: "booked", booking: toBooking(await fetchBooking(b.id)) };
  }
  if (intent.status === "requires_action" && intent.clientSecret) {
    return { status: "requires_action", booking: toBooking(b), clientSecret: intent.clientSecret };
  }
  if (isCancelable(intent.status)) await releaseClerkHold(intent.id);
  await closeUnheld(b.id, userId, "Your bank didn't confirm the hold, so nothing was held or charged.", null);
  throw paymentError(MESSAGES.authenticationFailed);
}

/**
 * payment_intent.amount_capturable_updated for a Gideon Clerk hold. It
 * finishes a booking whose customer closed the tab after 3-D Secure, and
 * releases a hold that no open booking uses (one whose response was lost
 * after the booking was closed). A booking ID this database doesn't have is
 * left alone: it may belong to another environment on the same Stripe
 * account.
 */
export async function handleClerkHoldAuthorizedEvent(pi: {
  id: string;
  status: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const bookingId = pi.metadata?.clerk_booking_id;
  if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId) || pi.status !== "requires_capture") return;
  const b = await findBooking(bookingId);
  if (!b || pi.metadata?.user_id !== b.user_id) return;

  if (
    b.status === "requested" &&
    !b.authorized_at &&
    (b.payment_intent_id == null || b.payment_intent_id === pi.id)
  ) {
    const intent = await retrieveClerkIntent(pi.id);
    if (intent.status === "requires_capture") await recordHoldAuthorized(b.id, intent, b.user_id);
    return;
  }
  if (b.payment_intent_id !== pi.id || b.status === "cancelled") {
    await releaseClerkHold(pi.id);
    await logAudit(null, "clerk.booking.stray_hold_released", "clerk_booking", b.id, null, {
      payment_intent_id: pi.id,
    });
  }
}

// ─── Admin: schedule, complete, cancel ───────────────────

export async function getAdminBooking(id: string): Promise<ClerkAdminBooking> {
  return fetchAdminBooking(id);
}

/**
 * Schedules (or reschedules) a session and emails the time and meeting
 * details to the customer's verified address. Returns whether the email was
 * sent, so the admin knows to reach the customer another way if it wasn't;
 * the details are on the customer's booking page either way.
 */
export async function scheduleClerkBooking(a: {
  adminId: string;
  bookingId: string;
  scheduledFor: Date;
  meetingDetails: string;
}): Promise<{ booking: ClerkAdminBooking; emailSent: boolean }> {
  const b = await fetchBooking(a.bookingId);
  if (!canClerkTransition(b.status, "scheduled")) {
    throw invalidTransition(`A ${b.status} booking can't be scheduled.`);
  }
  const problem = clerkScheduleProblem({
    scheduledFor: a.scheduledFor,
    now: new Date(),
    holdExpiresAt: b.authorized_at ? date(b.hold_expires_at) : null,
    hoursBooked: Number(b.hours_booked),
  });
  if (problem) throw badRequest(problem);
  const details = a.meetingDetails.trim();
  if (!details || details.length > CLERK_MEETING_DETAILS_MAX) {
    throw badRequest(`Write the meeting details (up to ${CLERK_MEETING_DETAILS_MAX} characters).`);
  }

  const row = await queryOne<BookingRow>(
    `UPDATE clerk_bookings SET status = 'scheduled', scheduled_for = $1, meeting_details = $2
     WHERE id = $3 AND status = $4 AND authorized_at IS NOT NULL
     RETURNING ${COLUMNS}`,
    [a.scheduledFor, details, b.id, b.status],
  );
  if (!row) throw conflict("This booking changed while you were scheduling it. Refresh the page.");

  const rescheduled = b.status === "scheduled";
  await logAudit(
    a.adminId,
    rescheduled ? "clerk.booking.rescheduled" : "clerk.booking.scheduled",
    "clerk_booking",
    b.id,
    { status: b.status, scheduled_for: iso(b.scheduled_for) },
    // The meeting details may hold a passcode; the audit log keeps only that
    // they were sent.
    { status: "scheduled", scheduled_for: a.scheduledFor.toISOString(), meeting_details_sent: true },
  );

  const to = await customerEmail(row.user_id);
  const emailSent = to
    ? await sendClerkEmails([
        clerkScheduledEmail(to, {
          when: formatClerkTime(a.scheduledFor, row.time_zone),
          hours: Number(row.hours_booked),
          meetingDetails: details,
          rescheduled,
          bookingsUrl: bookingsUrl(),
        }),
      ])
    : false;
  return { booking: await fetchAdminBooking(b.id), emailSent };
}

/**
 * Records the whole hours used and captures only those. The capture comes
 * first: the booking is marked completed only once Stripe has taken the
 * money, and a retry after a lost response finds the earlier capture.
 */
export async function completeClerkBooking(a: {
  adminId: string;
  bookingId: string;
  hoursUsed: number;
}): Promise<ClerkAdminBooking> {
  const b = await fetchBooking(a.bookingId);
  const problem = clerkCompleteProblem({ status: b.status, scheduledFor: b.scheduled_for, now: new Date() });
  if (problem) throw invalidTransition(problem);
  const plan = clerkCapturePlan({
    hoursUsed: a.hoursUsed,
    hoursBooked: Number(b.hours_booked),
    amountAuthorizedCents: Number(b.amount_authorized_cents),
  });
  if (!plan.ok) throw badRequest(plan.reason);
  if (!b.payment_intent_id || !b.authorized_at) {
    throw conflict("This booking has no authorized card hold to charge.");
  }

  await captureClerkHold(b.payment_intent_id, plan.cents);

  const row = await queryOne<BookingRow>(
    `UPDATE clerk_bookings
     SET status = 'completed', hours_used = $1, amount_captured_cents = $2, completed_at = now()
     WHERE id = $3 AND status = 'scheduled'
     RETURNING ${COLUMNS}`,
    [a.hoursUsed, plan.cents, b.id],
  );
  if (!row) throw conflict("This booking changed while you were completing it. Refresh the page.");

  const authorized = Number(b.amount_authorized_cents);
  await logAudit(
    a.adminId,
    "clerk.booking.completed",
    "clerk_booking",
    b.id,
    { status: "scheduled" },
    {
      status: "completed",
      hours_used: a.hoursUsed,
      amount_captured_cents: plan.cents,
      amount_released_cents: authorized - plan.cents,
    },
  );

  const to = await customerEmail(row.user_id);
  if (to) {
    await sendClerkEmails([
      clerkCompletedEmail(to, {
        hoursUsed: a.hoursUsed,
        hoursBooked: Number(row.hours_booked),
        capturedCents: plan.cents,
        releasedCents: authorized - plan.cents,
        bookingsUrl: bookingsUrl(),
      }),
    ]);
  }
  return fetchAdminBooking(b.id);
}

export const CLERK_SESSION_STARTED =
  "Your session has started, so it can't be cancelled here. Write to us through the Gideon Solutions contact page.";

/**
 * Cancels a booking and releases its hold; nothing is charged. A customer
 * can cancel until the session starts. An admin can cancel any open
 * booking (Gideon Clerk can't help, no time works, or the hold lapsed), and
 * the reason is shown to the customer.
 */
export async function cancelClerkBooking(a: {
  actorId: string;
  bookingId: string;
  asAdmin: boolean;
  reason?: string;
}): Promise<ClerkBooking> {
  const b = a.asAdmin ? await fetchBooking(a.bookingId) : await fetchOwnBooking(a.actorId, a.bookingId);
  if (!canClerkTransition(b.status, "cancelled")) {
    throw invalidTransition(`This booking is ${b.status} and can't be cancelled.`);
  }
  if (!a.asAdmin && !customerMayCancel(b, new Date())) throw forbidden(CLERK_SESSION_STARTED);
  const reason = a.asAdmin ? (a.reason ?? "").trim() : "You cancelled it.";
  if (!reason) throw badRequest("Say why the booking is cancelled. The customer sees this.");

  if (b.payment_intent_id) await releaseClerkHold(b.payment_intent_id);

  const row = await queryOne<BookingRow>(
    `UPDATE clerk_bookings SET status = 'cancelled', cancelled_at = now(), cancel_reason = $1
     WHERE id = $2 AND status IN ('requested', 'scheduled')
     RETURNING ${COLUMNS}`,
    [reason, b.id],
  );
  if (!row) throw conflict("This booking changed while you were cancelling it. Refresh the page.");

  await logAudit(
    a.actorId,
    "clerk.booking.cancelled",
    "clerk_booking",
    b.id,
    { status: b.status, scheduled_for: iso(b.scheduled_for) },
    { status: "cancelled", by: a.asAdmin ? "admin" : "customer", reason },
  );

  // Only a booking whose hold was authorized got a confirmation, so only
  // those get a cancellation.
  if (b.authorized_at) {
    const messages: EmailMessage[] = [];
    const to = await customerEmail(row.user_id);
    if (to) messages.push(clerkCancelledEmail(to, { reason, bookingsUrl: bookingsUrl() }));
    if (!a.asAdmin) {
      for (const admin of await adminEmails()) {
        messages.push(
          clerkAdminCancelNoticeEmail(admin, { scheduledForUtc: iso(b.scheduled_for), adminUrl: adminUrl() }),
        );
      }
    }
    await sendClerkEmails(messages);
  }
  return toBooking(row);
}
