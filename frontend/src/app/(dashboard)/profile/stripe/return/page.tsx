"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PayoutStatusSummary } from "@/components/stripe/payout-status";
import { useApi } from "@/lib/hooks/use-api";
import * as usersApi from "@/lib/api/users";
import type { ApiError } from "@/lib/types";

/**
 * Stripe's return_url. Reaching it only means the doer left the onboarding
 * flow, finished or not, so the page reads the account's real status.
 */
export default function StripeReturnPage() {
  const { data: status, loading, error } = useApi(
    () => usersApi.getStripeConnectStatus(),
    [],
  );
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  async function handleContinue() {
    setContinuing(true);
    setContinueError(null);
    try {
      const res = await usersApi.initiateStripeConnect();
      window.location.href = res.url;
    } catch (err) {
      setContinueError((err as ApiError).error ?? "Could not reopen Stripe onboarding.");
      setContinuing(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardContent className="py-8 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-sm text-gray-600">
              <Spinner />
              <p>Checking your payout setup with Stripe…</p>
            </div>
          ) : error || !status ? (
            <p className="text-sm text-red-700">
              {error?.error ?? "We could not check your payout setup."}
            </p>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900">
                {status.ready ? "Payouts are set up" : "Payout setup is not finished"}
              </h2>
              <PayoutStatusSummary status={status} />
              {!status.ready && status.needs_more_info && (
                <Button onClick={handleContinue} loading={continuing}>
                  Continue with Stripe
                </Button>
              )}
              {continueError && <p className="text-sm text-red-700">{continueError}</p>}
            </>
          )}
          <Link href="/profile/stripe" className="block text-sm text-blue-600 hover:underline">
            Back to Stripe Connect
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
