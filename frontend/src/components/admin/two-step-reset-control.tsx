"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { TwoStepRequiredNotice } from "@/components/two-step/two-step-required";
import { formatDateTime } from "@/lib/utils/format";
import * as twoStepApi from "@/lib/api/two-step";
import type { ApiError, TwoStepAdminView } from "@/lib/types";

/**
 * Resets two-step sign-in for someone who lost both their app and their
 * recovery codes, after confirming who they are some other way. Needs the
 * admin's own two-step sign-in; audited with the note; signs the user out
 * everywhere. An admin can't reset their own.
 */
export function TwoStepResetControl() {
  const { addToast } = useToast();
  const [userId, setUserId] = useState("");
  const [view, setView] = useState<TwoStepAdminView | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsTwoStep, setNeedsTwoStep] = useState<string | null>(null);

  function fail(err: unknown) {
    const e = err as ApiError;
    if (e.code === "two_step_required") setNeedsTwoStep(e.error);
    else addToast(e.error ?? "Action failed", "error");
  }

  async function lookUp() {
    setLoading(true);
    try {
      setView(await twoStepApi.getUserTwoStep(userId.trim()));
      setNote("");
    } catch (err) {
      setView(null);
      fail(err);
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    if (!view) return;
    setLoading(true);
    try {
      setView(await twoStepApi.resetUserTwoStep(view.id, note));
      setNote("");
      addToast("Two-step sign-in reset; the user is signed out everywhere", "success");
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-step sign-in reset</CardTitle>
        <p className="mt-1 text-sm text-gray-600">
          For someone who lost both their authenticator app and their recovery
          codes. Reset it only after confirming who they are some other way,
          and say how in the note. They are signed out everywhere and can set
          it up again; until then they can&apos;t share documents.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsTwoStep && <TwoStepRequiredNotice message={needsTwoStep} />}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              id="two_step_user_id"
              label="User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user UUID"
            />
          </div>
          <Button variant="secondary" size="sm" disabled={!userId.trim()} loading={loading && !view} onClick={lookUp}>
            Look up
          </Button>
        </div>
        {view && (
          <div className="space-y-3">
            <div className="rounded-md border border-gray-200 p-3 text-sm text-gray-700 space-y-1">
              <p className="font-medium text-gray-900">
                {view.legal_first_name} {view.legal_last_name} ({view.email})
              </p>
              <p>
                {view.enabled
                  ? `On since ${view.enabled_at ? formatDateTime(view.enabled_at) : "—"}, ${view.recovery_codes_left} recovery codes left`
                  : "Off"}
              </p>
              {view.locked_until && new Date(view.locked_until) > new Date() && (
                <p className="text-red-700">Locked until {formatDateTime(view.locked_until)} after wrong codes</p>
              )}
            </div>
            {view.enabled && (
              <>
                <Textarea
                  id="two_step_reset_note"
                  label="Note (how you confirmed who this is)"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button variant="danger" size="sm" disabled={!note.trim()} loading={loading} onClick={reset}>
                  Reset two-step sign-in
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
