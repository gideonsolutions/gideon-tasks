"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks/use-api";
import * as clerkApi from "@/lib/api/clerk";
import type { ApiError } from "@/lib/types";
import {
  CLERK_HOURLY_CENTS,
  CLERK_MEETING_DETAILS_MAX,
  CLERK_SESSION_TYPE_LABELS,
  formatClerkTime,
  formatHours,
  formatWholeDollars,
} from "@/server/clerk-rules";

type Booking = clerkApi.ClerkAdminBooking;

const STATUS_STYLE: Record<Booking["status"], string> = {
  requested: "bg-blue-100 text-blue-800",
  scheduled: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-gray-100 text-gray-600",
};

/** "2026-11-24T14:00" in this browser's zone, for a datetime-local input. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A UTC instant shown in this browser's zone and the customer's. */
function Instant({ iso, timeZone }: { iso: string; timeZone: string }) {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <>
      {formatClerkTime(iso, local)}
      {local !== timeZone && <> (customer: {formatClerkTime(iso, timeZone)})</>}
    </>
  );
}

function ScheduleForm({ booking, onDone }: { booking: Booking; onDone: (b: Booking) => void }) {
  const { addToast } = useToast();
  const [when, setWhen] = useState(booking.scheduled_for ? toLocalInput(new Date(booking.scheduled_for)) : "");
  const [details, setDetails] = useState(booking.meeting_details ?? "");
  const [saving, setSaving] = useState(false);
  const rescheduling = booking.status === "scheduled";
  const chosen = when ? new Date(when) : null;
  const valid = chosen && !Number.isNaN(chosen.getTime());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !details.trim()) return;
    setSaving(true);
    try {
      const res = await clerkApi.scheduleClerkBooking(booking.id, {
        scheduled_for: chosen.toISOString(),
        meeting_details: details,
      });
      if (res.email_sent) {
        addToast(rescheduling ? "Rescheduled and emailed." : "Scheduled and emailed.", "success");
      } else {
        addToast(
          "Saved, but the email couldn't be sent. The time and details are on the customer's bookings page; reach them another way too.",
          "error",
        );
      }
      onDone(res.booking);
    } catch (err) {
      addToast((err as ApiError).error ?? "Couldn't schedule the session.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-gray-200 p-3">
      <p className="font-medium text-gray-900">{rescheduling ? "Reschedule" : "Schedule"}</p>
      <Input
        id={`when-${booking.id}`}
        type="datetime-local"
        label="Start (your time)"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />
      {valid && (
        <p className="text-sm text-gray-700">
          The customer reads: <strong>{formatClerkTime(chosen, booking.time_zone)}</strong>
        </p>
      )}
      {booking.latest_session_start && (
        <p className="text-sm text-gray-700">
          Latest start: <Instant iso={booking.latest_session_start} timeZone={booking.time_zone} />
        </p>
      )}
      <Textarea
        id={`details-${booking.id}`}
        label="Meeting details (emailed to the customer and shown on their bookings page)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={CLERK_MEETING_DETAILS_MAX}
        placeholder={
          booking.session_type === "video"
            ? "The video link, and any passcode."
            : "How the call works: we call the number on your account, or the number to call."
        }
      />
      <Button type="submit" size="sm" loading={saving} disabled={!valid || !details.trim()}>
        {rescheduling ? "Reschedule and email the customer" : "Schedule and email the customer"}
      </Button>
    </form>
  );
}

function CompleteForm({ booking, onDone }: { booking: Booking; onDone: (b: Booking) => void }) {
  const { addToast } = useToast();
  const [hours, setHours] = useState(booking.hours_booked);
  const [saving, setSaving] = useState(false);
  const charge = hours * CLERK_HOURLY_CENTS;
  const release = booking.amount_authorized_cents - charge;
  const started = booking.session_started;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await clerkApi.completeClerkBooking(booking.id, { hours_used: hours });
      addToast(`Charged ${formatWholeDollars(charge)}.`, "success");
      onDone(res.booking);
    } catch (err) {
      addToast((err as ApiError).error ?? "Couldn't record the session.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-gray-200 p-3">
      <p className="font-medium text-gray-900">Record the session</p>
      <Select
        id={`hours-${booking.id}`}
        label="Whole hours used"
        value={String(hours)}
        onChange={(e) => setHours(Number(e.target.value))}
        options={Array.from({ length: booking.hours_booked }, (_, i) => ({
          value: String(i + 1),
          label: formatHours(i + 1),
        }))}
      />
      <p className="text-sm text-gray-700">
        Charges <strong>{formatWholeDollars(charge)}</strong>
        {release > 0 ? ` and releases ${formatWholeDollars(release)}` : ""}. This
        can&apos;t be undone here.
      </p>
      {!started && (
        <p className="text-sm text-amber-800">You can record it once the session has started.</p>
      )}
      <Button type="submit" size="sm" loading={saving} disabled={!started}>
        Record {formatHours(hours)} and charge {formatWholeDollars(charge)}
      </Button>
    </form>
  );
}

function CancelForm({ booking, onDone }: { booking: Booking; onDone: (b: Booking) => void }) {
  const { addToast } = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSaving(true);
    try {
      const res = await clerkApi.cancelClerkBookingAdmin(booking.id, { reason });
      addToast("Cancelled. The hold is released.", "success");
      onDone(res.booking);
    } catch (err) {
      addToast((err as ApiError).error ?? "Couldn't cancel the booking.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-gray-200 p-3">
      <p className="font-medium text-gray-900">Cancel</p>
      <Textarea
        id={`reason-${booking.id}`}
        label="Reason (the customer sees this)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="For example: Gideon Clerk can't help with tax matters."
      />
      <Button type="submit" size="sm" variant="danger" loading={saving} disabled={!reason.trim()}>
        Cancel and release the hold
      </Button>
    </form>
  );
}

function AdminBookingCard({ initial }: { initial: Booking }) {
  const [booking, setBooking] = useState(initial);
  const open = booking.status === "requested" || booking.status === "scheduled";
  const expired = open && booking.hold_lapsed;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {booking.customer_name}: {formatHours(booking.hours_booked)},{" "}
            {CLERK_SESSION_TYPE_LABELS[booking.session_type].toLowerCase()}
          </CardTitle>
          <Badge className={STATUS_STYLE[booking.status]}>
            {booking.status === "requested" && !booking.hold_authorized ? "waiting for bank" : booking.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-gray-800">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
          <dt className="text-gray-500">Email</dt>
          <dd>{booking.customer_email}</dd>
          <dt className="text-gray-500">Phone</dt>
          <dd>{booking.customer_phone}</dd>
          <dt className="text-gray-500">Time zone</dt>
          <dd>{booking.time_zone}</dd>
          <dt className="text-gray-500">Booked</dt>
          <dd>
            <Instant iso={booking.created_at} timeZone={booking.time_zone} />
          </dd>
          <dt className="text-gray-500">Hold</dt>
          <dd>
            {formatWholeDollars(booking.amount_authorized_cents)}
            {booking.hold_authorized ? " authorized" : " not authorized yet (3-D Secure unfinished)"}
            {booking.payment_intent_id && <span className="ml-1 font-mono text-xs">{booking.payment_intent_id}</span>}
          </dd>
          {open && booking.hold_expires_at && (
            <>
              <dt className="text-gray-500">Hold lapses</dt>
              <dd>
                <Instant iso={booking.hold_expires_at} timeZone={booking.time_zone} />
              </dd>
            </>
          )}
          {booking.scheduled_for && (
            <>
              <dt className="text-gray-500">Session</dt>
              <dd>
                <Instant iso={booking.scheduled_for} timeZone={booking.time_zone} />
              </dd>
            </>
          )}
          {booking.status === "completed" && booking.amount_captured_cents != null && (
            <>
              <dt className="text-gray-500">Charged</dt>
              <dd>
                {formatWholeDollars(booking.amount_captured_cents)} for{" "}
                {formatHours(booking.hours_used ?? 0)}
              </dd>
            </>
          )}
          {booking.status === "cancelled" && (
            <>
              <dt className="text-gray-500">Cancelled</dt>
              <dd>{booking.cancel_reason}</dd>
            </>
          )}
        </dl>

        {booking.moderation_note && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
            Moderation flagged this description: {booking.moderation_note}
          </p>
        )}
        <div>
          <p className="font-medium text-gray-900">What they need</p>
          <p className="whitespace-pre-wrap break-words">{booking.description}</p>
        </div>
        {booking.meeting_details && (
          <div>
            <p className="font-medium text-gray-900">Meeting details sent</p>
            <p className="whitespace-pre-wrap break-words">{booking.meeting_details}</p>
          </div>
        )}

        {expired && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
            The card hold has lapsed, so nothing can be charged. Cancel this booking.
          </p>
        )}

        {open && (
          <div className="space-y-3">
            {booking.hold_authorized && !expired && <ScheduleForm booking={booking} onDone={setBooking} />}
            {booking.status === "scheduled" && !expired && <CompleteForm booking={booking} onDone={setBooking} />}
            <CancelForm booking={booking} onDone={setBooking} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ClerkBookingsAdmin() {
  const [scope, setScope] = useState<"open" | "all">("open");
  const { data, loading, error } = useApi(() => clerkApi.listClerkBookingsAdmin(scope), [scope]);

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-gray-700">
        Gideon Clerk bookings. Schedule each one so it ends a day before its
        card hold lapses, record the whole hours used after the session (only
        those are charged), or cancel to release the hold.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant={scope === "open" ? "primary" : "secondary"} onClick={() => setScope("open")}>
          Open
        </Button>
        <Button size="sm" variant={scope === "all" ? "primary" : "secondary"} onClick={() => setScope("all")}>
          All
        </Button>
      </div>
      {loading && !data ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-700">{error.error}</p>
      ) : data && data.length > 0 ? (
        // Keyed by scope too, so switching tabs resets each card's local copy.
        data.map((b) => <AdminBookingCard key={`${scope}-${b.id}`} initial={b} />)
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-gray-500">
            {scope === "open" ? "No open bookings." : "No bookings yet."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
