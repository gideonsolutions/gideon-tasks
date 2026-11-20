"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks/use-api";
import * as usersApi from "@/lib/api/users";

/**
 * Shown to the assigned doer before they start: starting work charges the
 * requester, which is only allowed once payouts are set up.
 */
export function PayoutNotice() {
  const { data: status, loading } = useApi(() => usersApi.getStripeConnectStatus(), []);
  if (loading || !status || status.ready) return null;
  return (
    <div
      role="status"
      className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-medium">Set up payouts before you start</p>
      <p className="mt-1">
        Starting work charges the requester&apos;s card, so it is only possible
        once Stripe can pay you.{" "}
        <Link href="/profile/stripe" className="font-medium text-blue-700 hover:underline">
          Set up payouts
        </Link>
      </p>
    </div>
  );
}
