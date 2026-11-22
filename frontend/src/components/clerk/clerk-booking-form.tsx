"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ClerkLoginSafety } from "@/components/clerk/login-safety";
import { formatCardBrand, getStripe } from "@/lib/stripe";
import * as clerkApi from "@/lib/api/clerk";
import type { ApiError, SavedCard } from "@/lib/types";
import {
  CLERK_DESCRIPTION_MAX,
  CLERK_DESCRIPTION_MIN,
  CLERK_MAX_HOURS,
  CLERK_MIN_HOURS,
  CLERK_SESSION_TYPES,
  CLERK_SESSION_TYPE_LABELS,
  CLERK_TIME_ZONES,
  clerkAmountCents,
  formatHours,
  formatWholeDollars,
  isClerkTimeZone,
  type ClerkSessionType,
} from "@/server/clerk-rules";

const AUTH_FAILED =
  "Your bank could not confirm the hold, so nothing was held or charged. Try again, or add a different card under Payment Card.";
const STILL_WAITING =
  "Your bank's check isn't finished. Use \"Confirm with your bank\" on the booking to try again, or cancel it.";

const HOURS = Array.from(
  { length: CLERK_MAX_HOURS - CLERK_MIN_HOURS + 1 },
  (_, i) => CLERK_MIN_HOURS + i,
);

/** The browser's time zone when it is one of the US zones offered, else Eastern. */
function initialTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isClerkTimeZone(tz)) return tz;
  } catch {
    // Fall through to the default.
  }
  return "America/New_York";
}

/**
 * Runs the bank's 3-D Secure check, then asks the server, which reads the
 * hold's state from Stripe, whether the booking went through.
 */
export async function finishWithBank(
  bookingId: string,
  clientSecret: string,
): Promise<clerkApi.ClerkBooking> {
  const stripe = await getStripe();
  if (!stripe) throw { error: "Card payments are not available right now." } as ApiError;
  const result = await stripe.handleNextAction({ clientSecret });
  const again = await clerkApi.confirmClerkBooking(bookingId);
  if (again.status === "booked") return again.booking;
  throw { error: result.error?.message ? `${result.error.message} ${STILL_WAITING}` : STILL_WAITING } as ApiError;
}

export function ClerkBookingForm({
  card,
  onChanged,
}: {
  card: SavedCard | null;
  /** Called after any attempt, so the booking list refreshes; with a message on success. */
  onChanged: (successMessage?: string) => void;
}) {
  const [hours, setHours] = useState(1);
  const [sessionType, setSessionType] = useState<ClerkSessionType>("video");
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [description, setDescription] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = clerkAmountCents(hours);
  const length = description.trim().length;
  const canSubmit =
    !!card &&
    acknowledged &&
    length >= CLERK_DESCRIPTION_MIN &&
    length <= CLERK_DESCRIPTION_MAX &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const first = await clerkApi.createClerkBooking({
        hours,
        session_type: sessionType,
        time_zone: timeZone,
        description,
        safety_acknowledged: acknowledged,
      });
      if (first.status === "requires_action") {
        await finishWithBank(first.booking.id, first.payment_client_secret);
      }
      setDescription("");
      setAcknowledged(false);
      onChanged(
        `Booked. We placed a hold of ${formatWholeDollars(amount)} on your card and will email you the time.`,
      );
    } catch (err) {
      const message = (err as ApiError).error;
      setError(message === undefined ? AUTH_FAILED : message);
      // The booking list shows any booking that is waiting for the bank.
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Select
        id="clerk_hours"
        label="How many hours?"
        value={String(hours)}
        onChange={(e) => setHours(Number(e.target.value))}
        options={HOURS.map((h) => ({
          value: String(h),
          label: `${formatHours(h)}: ${formatWholeDollars(clerkAmountCents(h))}`,
        }))}
      />
      <p className="text-sm text-gray-700">
        Up to {CLERK_MAX_HOURS} hours per booking. You&apos;re charged only for
        the whole hours used, never more than you book.
      </p>

      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-gray-700">How should we meet?</legend>
        {CLERK_SESSION_TYPES.map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm text-gray-900">
            <input
              type="radio"
              name="clerk_session_type"
              value={t}
              checked={sessionType === t}
              onChange={() => setSessionType(t)}
            />
            {CLERK_SESSION_TYPE_LABELS[t]}
          </label>
        ))}
        <p className="text-sm text-gray-700">
          Online only for now; in-person sessions aren&apos;t offered yet. We
          email you the time and how to join.
        </p>
      </fieldset>

      <Select
        id="clerk_time_zone"
        label="Your time zone"
        value={timeZone}
        onChange={(e) => setTimeZone(e.target.value)}
        options={CLERK_TIME_ZONES.map((z) => ({ value: z.value, label: z.label }))}
      />

      <div className="space-y-2">
        <Textarea
          id="clerk_description"
          label="What do you need help with, and when are you free over the next few days?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={CLERK_DESCRIPTION_MAX}
          rows={6}
        />
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            <strong>Don&apos;t include passwords, Social Security numbers or account numbers.</strong>{" "}
            Name the agency, company or website and the form or letter instead.
            Links, phone numbers and email addresses aren&apos;t accepted
            either: write &ldquo;the state benefits website&rdquo;, not its
            address.
          </p>
        </div>
        <p className="text-sm text-gray-600">
          {length} of {CLERK_DESCRIPTION_MIN}&ndash;{CLERK_DESCRIPTION_MAX} characters.
        </p>
      </div>

      <ClerkLoginSafety headingLevel={3} />

      <label className="flex items-start gap-2 text-sm text-gray-900">
        <input
          type="checkbox"
          className="mt-1"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>
          I&apos;ve read this. I will type my own passwords and codes, and I
          decide whether to share my screen.
        </span>
      </label>

      {card ? (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
          Booking places a hold of <strong>{formatWholeDollars(amount)}</strong> on
          your {formatCardBrand(card.brand)} ending in {card.last4}. Nothing is
          charged until after the session, and only for the hours used.{" "}
          <Link href="/profile/payment" className="text-blue-600 hover:underline">
            Change card
          </Link>
        </p>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Add a payment card before you book.{" "}
          <Link href="/profile/payment" className="font-medium text-blue-700 hover:underline">
            Add a card
          </Link>
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <Button type="submit" loading={submitting} disabled={!canSubmit}>
        Book {formatHours(hours)} ({formatWholeDollars(amount)} hold)
      </Button>
    </form>
  );
}
