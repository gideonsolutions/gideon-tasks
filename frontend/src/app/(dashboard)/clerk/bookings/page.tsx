"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { ClerkBookingForm, finishWithBank } from "@/components/clerk/clerk-booking-form";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import * as clerkApi from "@/lib/api/clerk";
import * as paymentsApi from "@/lib/api/payments";
import { CONTACT_URL } from "@/lib/constants";
import type { ApiError } from "@/lib/types";
import {
  CLERK_HOURLY_CENTS,
  CLERK_SESSION_TYPE_LABELS,
  formatClerkTime,
  formatHours,
  formatWholeDollars,
} from "@/server/clerk-rules";

/** What the customer reads for each state. */
function customerStatus(b: clerkApi.ClerkBooking): { label: string; className: string } {
  switch (b.status) {
    case "requested":
      return b.hold_authorized
        ? { label: "Booked: we'll email you a time", className: "bg-blue-100 text-blue-800" }
        : { label: "Waiting for your bank", className: "bg-amber-100 text-amber-800" };
    case "scheduled":
      return { label: "Scheduled", className: "bg-green-100 text-green-800" };
    case "completed":
      return { label: "Completed", className: "bg-gray-100 text-gray-800" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-gray-100 text-gray-600" };
  }
}

function BookingCard({
  booking,
  onChanged,
}: {
  booking: clerkApi.ClerkBooking;
  onChanged: (message?: string, isError?: boolean) => void;
}) {
  const [busy, setBusy] = useState<"cancel" | "bank" | null>(null);
  const status = customerStatus(booking);

  async function handleCancel() {
    setBusy("cancel");
    try {
      const res = await clerkApi.cancelClerkBooking(booking.id);
      onChanged(res.message);
    } catch (err) {
      onChanged((err as ApiError).error ?? "The booking couldn't be cancelled.", true);
    } finally {
      setBusy(null);
    }
  }

  async function handleBank() {
    setBusy("bank");
    try {
      const res = await clerkApi.confirmClerkBooking(booking.id);
      if (res.status === "requires_action") {
        await finishWithBank(booking.id, res.payment_client_secret);
      }
      onChanged("Your bank confirmed the hold. We'll email you a time.");
    } catch (err) {
      onChanged((err as ApiError).error ?? "Your bank couldn't confirm the hold.", true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {formatHours(booking.hours_booked)},{" "}
            {CLERK_SESSION_TYPE_LABELS[booking.session_type].toLowerCase()}
          </CardTitle>
          <Badge className={status.className}>{status.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Booked {formatClerkTime(booking.created_at, booking.time_zone)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-gray-800">
        {booking.status === "scheduled" && booking.scheduled_for && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
            <p>
              <strong>Your session:</strong>{" "}
              {formatClerkTime(booking.scheduled_for, booking.time_zone)}, for up
              to {formatHours(booking.hours_booked)}.
            </p>
            {booking.meeting_details && (
              <div>
                <p className="font-medium">How to join (also sent to your email):</p>
                <p className="whitespace-pre-wrap break-words">{booking.meeting_details}</p>
              </div>
            )}
          </div>
        )}

        {(booking.status === "requested" || booking.status === "scheduled") && (
          <p>
            {booking.hold_authorized ? (
              <>
                Hold on your card: <strong>{formatWholeDollars(booking.amount_authorized_cents)}</strong>.
                Nothing is charged until after the session, and only for the
                whole hours used.
              </>
            ) : (
              <>
                Your bank hasn&apos;t confirmed the hold of{" "}
                {formatWholeDollars(booking.amount_authorized_cents)} yet, so
                this booking isn&apos;t final.
              </>
            )}
          </p>
        )}

        {booking.status === "completed" && booking.amount_captured_cents != null && (
          <p>
            The session used {formatHours(booking.hours_used ?? 0)}. You were
            charged <strong>{formatWholeDollars(booking.amount_captured_cents)}</strong>
            {booking.amount_authorized_cents > booking.amount_captured_cents
              ? `, and the rest of the hold (${formatWholeDollars(
                  booking.amount_authorized_cents - booking.amount_captured_cents,
                )}) was released.`
              : "."}
          </p>
        )}

        {booking.status === "cancelled" && (
          <p>
            {booking.cancel_reason ?? "Cancelled."} Nothing was charged.
          </p>
        )}

        <details>
          <summary className="cursor-pointer text-gray-600">What you asked for</summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{booking.description}</p>
        </details>

        <div className="flex flex-wrap gap-2">
          {booking.status === "requested" && !booking.hold_authorized && (
            <Button size="sm" loading={busy === "bank"} disabled={busy !== null} onClick={handleBank}>
              Confirm with your bank
            </Button>
          )}
          {booking.customer_may_cancel && (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "cancel"}
              disabled={busy !== null}
              onClick={handleCancel}
            >
              Cancel booking
            </Button>
          )}
        </div>
        {booking.status === "scheduled" && !booking.customer_may_cancel && (
          <p className="text-gray-700">
            The session has started, so it can&apos;t be cancelled here. To
            raise a problem, write to us through the{" "}
            <a href={CONTACT_URL} className="text-blue-600 hover:underline">
              Gideon Solutions contact page
            </a>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClerkBookingsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { data: bookings, loading, error, refetch } = useApi(() => clerkApi.listMyClerkBookings(), []);
  const { data: payment } = useApi(() => paymentsApi.getPaymentMethod(), []);

  const open = (bookings ?? []).filter((b) => b.status === "requested" || b.status === "scheduled");
  const card = payment?.card ?? null;

  function handleChanged(message?: string, isError = false) {
    if (message) addToast(message, isError ? "error" : "success");
    refetch();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gideon Clerk</h1>
        <p className="mt-2 text-gray-700">
          Help with paperwork and online accounts, at{" "}
          {formatWholeDollars(CLERK_HOURLY_CENTS)} an hour, all-in. A service
          from Gideon Solutions, LLC, the company that runs Gideon Tasks.{" "}
          <Link href="/clerk" className="text-blue-600 hover:underline">
            How Gideon Clerk works
          </Link>
        </p>
      </div>

      <EmailVerificationNotice purpose="to book Gideon Clerk (we email your session details to it)" />

      {loading && !bookings ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : error && !bookings ? (
        <p className="text-sm text-red-700">{error.error}</p>
      ) : (
        <>
          {open.length === 0 ? (
            user?.email_verified && (
              <Card>
                <CardHeader>
                  <CardTitle>Book a session</CardTitle>
                </CardHeader>
                <CardContent>
                  <ClerkBookingForm card={card} onChanged={handleChanged} />
                </CardContent>
              </Card>
            )
          ) : (
            <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
              You have an open booking. You can book another once it&apos;s
              done or cancelled.
            </p>
          )}

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Your bookings</h2>
            {bookings && bookings.length > 0 ? (
              bookings.map((b) => <BookingCard key={b.id} booking={b} onChanged={handleChanged} />)
            ) : (
              <p className="text-sm text-gray-600">No bookings yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
