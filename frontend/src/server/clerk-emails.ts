import "server-only";
import { escapeHtml, sendEmail, type EmailMessage } from "./email";
import {
  CLERK_HOLD_DAYS,
  CLERK_SESSION_TYPE_LABELS,
  CLERK_SESSION_WINDOW_DAYS,
  clerkLoginSafety,
  formatHours,
  formatWholeDollars,
  type ClerkSessionType,
} from "./clerk-rules";

/**
 * Gideon Clerk emails. Gideon Solutions emails the customer's verified
 * account address: it is the house's own channel, and Gideon Tasks
 * messages reject links and contact details, so a meeting link can't be
 * sent there.
 *
 * The customer's own booking description is never put in an email. The
 * only free text is the meeting details an admin writes when scheduling.
 */

const FROM_LINE =
  "Gideon Clerk is a service from Gideon Solutions, LLC, the company that runs Gideon Tasks.";

/** A paragraph of plain text, or several lines kept as written (meeting details). */
type Block = string | { lines: string };

function build(to: string, subject: string, blocks: Block[]): EmailMessage {
  const safety = [
    "How to tell it's us:",
    ...clerkLoginSafety("Gideon Tasks").map((l) => `- ${l}`),
    "If a message asks for any of these, it isn't from Gideon Clerk.",
  ];
  const text = [
    ...blocks.map((b) => (typeof b === "string" ? b : b.lines)),
    safety.join("\n"),
    FROM_LINE,
  ].join("\n\n");

  const htmlBlocks = blocks.map((b) =>
    typeof b === "string"
      ? `<p>${escapeHtml(b)}</p>`
      : `<p>${escapeHtml(b.lines).replace(/\r?\n/g, "<br>")}</p>`,
  );
  const html = [
    ...htmlBlocks,
    `<p><strong>How to tell it's us:</strong></p>`,
    `<ul>${clerkLoginSafety("Gideon Tasks")
      .map((l) => `<li>${escapeHtml(l)}</li>`)
      .join("")}</ul>`,
    `<p>If a message asks for any of these, it isn't from Gideon Clerk.</p>`,
    `<p>${escapeHtml(FROM_LINE)}</p>`,
  ].join("\n");

  return { to, subject, text: `${text}\n`, html };
}

export function clerkBookedEmail(
  to: string,
  b: { hours: number; amountCents: number; sessionType: ClerkSessionType; bookingsUrl: string },
): EmailMessage {
  return build(to, "Gideon Clerk: we have your booking", [
    `You booked ${formatHours(b.hours)} of Gideon Clerk (${CLERK_SESSION_TYPE_LABELS[b.sessionType].toLowerCase()}). We placed a hold of ${formatWholeDollars(b.amountCents)} on your card. Nothing is charged yet.`,
    `Next, we email you the time of your session and how to join. The hold on your card lasts up to ${CLERK_HOLD_DAYS} days, so we schedule your session to end within ${CLERK_SESSION_WINDOW_DAYS} days of booking. If we can't find a time, we release the hold and you pay nothing.`,
    "After the session, we charge only the whole hours used, never more than you booked, and release the rest of the hold. You can cancel at any time before the session starts and pay nothing.",
    `Your booking: ${b.bookingsUrl}`,
  ]);
}

export function clerkAdminNoticeEmail(
  to: string,
  b: {
    hours: number;
    amountCents: number;
    sessionType: ClerkSessionType;
    latestStartUtc: string;
    flagged: boolean;
    adminUrl: string;
  },
): EmailMessage {
  return build(to, "New Gideon Clerk booking", [
    `A customer booked ${formatHours(b.hours)} of Gideon Clerk (${CLERK_SESSION_TYPE_LABELS[b.sessionType].toLowerCase()}). The hold of ${formatWholeDollars(b.amountCents)} on their card is authorized.`,
    `Schedule the session to start by ${b.latestStartUtc} (UTC), or cancel the booking to release the hold.`,
    ...(b.flagged
      ? ["Moderation flagged the description. Read it before you schedule the session."]
      : []),
    `Open the booking: ${b.adminUrl}`,
  ]);
}

export function clerkScheduledEmail(
  to: string,
  b: {
    when: string;
    hours: number;
    meetingDetails: string;
    rescheduled: boolean;
    bookingsUrl: string;
  },
): EmailMessage {
  return build(
    to,
    b.rescheduled ? "Gideon Clerk: your session has a new time" : "Gideon Clerk: your session is scheduled",
    [
      `Your Gideon Clerk session is ${b.rescheduled ? "now " : ""}scheduled for ${b.when}, for up to ${formatHours(b.hours)}.`,
      "How to join:",
      { lines: b.meetingDetails },
      `The same time and details are on your Gideon Clerk page: ${b.bookingsUrl}. If an email about your session doesn't match that page, it isn't from us.`,
      "Have your letters, forms and devices ready. You can cancel on that page before the session starts and pay nothing.",
    ],
  );
}

export function clerkCompletedEmail(
  to: string,
  b: { hoursUsed: number; hoursBooked: number; capturedCents: number; releasedCents: number; bookingsUrl: string },
): EmailMessage {
  const released =
    b.releasedCents > 0
      ? `and released the rest of the hold (${formatWholeDollars(b.releasedCents)})`
      : "and nothing else is held";
  return build(to, "Gideon Clerk: your session is complete", [
    `Your Gideon Clerk session used ${formatHours(b.hoursUsed)} of the ${formatHours(b.hoursBooked)} you booked. We charged ${formatWholeDollars(b.capturedCents)} to your card ${released}.`,
    `Your booking: ${b.bookingsUrl}`,
  ]);
}

export function clerkCancelledEmail(
  to: string,
  b: { reason: string; bookingsUrl: string },
): EmailMessage {
  return build(to, "Gideon Clerk: your booking is cancelled", [
    `Your Gideon Clerk booking is cancelled. ${b.reason}`,
    "We released the hold on your card, and nothing is charged. Your bank decides how soon the hold disappears from your account.",
    `Your bookings: ${b.bookingsUrl}`,
  ]);
}

export function clerkAdminCancelNoticeEmail(
  to: string,
  b: { scheduledForUtc: string | null; adminUrl: string },
): EmailMessage {
  return build(to, "Gideon Clerk booking cancelled by the customer", [
    b.scheduledForUtc
      ? `A customer cancelled their Gideon Clerk session scheduled for ${b.scheduledForUtc} (UTC). The hold on their card is released.`
      : "A customer cancelled their Gideon Clerk booking before it was scheduled. The hold on their card is released.",
    `Bookings: ${b.adminUrl}`,
  ]);
}

/**
 * Sends after the booking change is saved. A failed email (production has
 * no RESEND_API_KEY yet, for one) is logged and never undoes the change.
 * Returns whether every message was sent.
 */
export async function sendClerkEmails(messages: EmailMessage[]): Promise<boolean> {
  let allSent = true;
  for (const m of messages) {
    try {
      await sendEmail(m);
    } catch (e) {
      allSent = false;
      console.error(`[clerk] Could not send "${m.subject}":`, e);
    }
  }
  return allSent;
}
