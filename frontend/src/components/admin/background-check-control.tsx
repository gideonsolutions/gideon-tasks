"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import * as adminApi from "@/lib/api/admin";
import { formatDateTime } from "@/lib/utils/format";
import type { ApiError, BackgroundCheckRecord } from "@/lib/types";

/**
 * Records or clears a user's background check. No provider is integrated:
 * the admin reviews the provider's report and records the result here. Only
 * users with a recorded check can apply to, ask about or be booked for
 * tutoring for a child.
 */
export function BackgroundCheckControl() {
  const { addToast } = useToast();
  const [userId, setUserId] = useState("");
  const [record, setRecord] = useState<BackgroundCheckRecord | null>(null);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function lookUp() {
    setLoading(true);
    try {
      setRecord(await adminApi.getBackgroundCheck(userId.trim()));
      setNote("");
      setConfirmed(false);
    } catch (err) {
      setRecord(null);
      addToast((err as ApiError).error ?? "Lookup failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function change(action: "record" | "clear") {
    if (!record) return;
    setLoading(true);
    try {
      const updated = await adminApi.changeBackgroundCheck(
        record.id,
        action === "record"
          ? { action, note, confirms_identity_and_adult: true }
          : { action, note },
      );
      setRecord(updated);
      setNote("");
      setConfirmed(false);
      addToast(
        action === "record" ? "Background check recorded" : "Background check cleared",
        "success",
      );
    } catch (err) {
      addToast((err as ApiError).error ?? "Action failed", "error");
    } finally {
      setLoading(false);
    }
  }

  const cleared = !!record?.background_check_cleared_at;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Background check</CardTitle>
        <p className="mt-1 text-sm text-gray-600">
          Record a check only after you have reviewed the provider&apos;s
          report. Only users with a recorded check can apply to, ask about or
          be booked for tutoring for a child. Clearing it stops new
          applications and bookings; it does not cancel tasks the user is
          already booked for.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              id="background_check_user_id"
              label="User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user UUID"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!userId.trim()}
            loading={loading && !record}
            onClick={lookUp}
          >
            Look up
          </Button>
        </div>

        {record && (
          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 p-3 text-sm text-gray-700 space-y-1">
              <p className="font-medium text-gray-900">
                {record.legal_first_name} {record.legal_last_name} ({record.email})
              </p>
              <p>Account: {record.status}</p>
              <p>
                {cleared
                  ? `Check recorded ${formatDateTime(record.background_check_cleared_at!)}`
                  : "No check recorded"}
              </p>
              {record.background_check_note && (
                <p className="text-gray-600">Note: {record.background_check_note}</p>
              )}
            </div>
            <Textarea
              id="background_check_note"
              label={
                cleared
                  ? "Note (the provider and report, or why you are clearing it)"
                  : "Note (the provider and report you reviewed)"
              }
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                The provider&apos;s report confirms this person&apos;s
                identity and that they are 18 or older, and its result is
                clear.
              </span>
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!note.trim() || !confirmed}
                loading={loading}
                onClick={() => change("record")}
              >
                {cleared ? "Record a new check" : "Record check"}
              </Button>
              {cleared && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!note.trim()}
                  loading={loading}
                  onClick={() => change("clear")}
                >
                  Clear check
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
