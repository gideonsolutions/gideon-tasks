"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/use-auth";
import * as authApi from "@/lib/api/auth";
import type { ApiError } from "@/lib/types";

interface EmailVerificationNoticeProps {
  /** What a confirmed email unlocks here, e.g. "to post tasks". */
  purpose?: string;
}

/**
 * Shown to signed-in users whose email address is not confirmed yet, with a
 * button to send a new link. Renders nothing for confirmed users.
 */
export function EmailVerificationNotice({
  purpose = "to post tasks or apply for them",
}: EmailVerificationNoticeProps) {
  const { user, fetchUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const refreshed = useRef(false);
  const unverified = !!user && !user.email_verified;

  // The stored profile can be stale if the link was opened in another tab or
  // on another device, so check with the server once.
  useEffect(() => {
    if (unverified && !refreshed.current) {
      refreshed.current = true;
      void fetchUser();
    }
  }, [unverified, fetchUser]);

  if (!user || user.email_verified) return null;

  async function handleResend() {
    setSending(true);
    setStatus(null);
    try {
      const res = await authApi.resendVerification();
      if (res.already_verified) {
        await fetchUser();
        return;
      }
      setStatus({ ok: true, text: res.message });
    } catch (err) {
      setStatus({
        ok: false,
        text: (err as ApiError).error ?? "We could not send the email.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="status"
      className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-medium">Verify your email address</p>
      <p className="mt-1">
        You need a confirmed email address {purpose}. Open the link we emailed
        to {user.email}. Links expire after 24 hours.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" loading={sending} onClick={handleResend}>
          Resend email
        </Button>
        {status && (
          <span className={status.ok ? "text-green-700" : "text-red-700"}>
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}
