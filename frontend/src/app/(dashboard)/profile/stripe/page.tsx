"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { PayoutStatusSummary } from "@/components/stripe/payout-status";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import * as usersApi from "@/lib/api/users";
import type { ApiError } from "@/lib/types";

export default function StripeConnectPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const { data: status, loading: statusLoading, error } = useApi(
    () => usersApi.getStripeConnectStatus(),
    [],
  );

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await usersApi.initiateStripeConnect();
      window.location.href = res.url;
    } catch (err) {
      addToast((err as ApiError).error ?? "Failed to start onboarding", "error");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Stripe Connect</h1>

      <EmailVerificationNotice purpose="to set up payouts" />

      <Card>
        <CardHeader>
          <CardTitle>Payouts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : error ? (
            <p className="text-sm text-red-700">{error.error}</p>
          ) : status?.connected ? (
            <div className="space-y-3">
              <PayoutStatusSummary status={status} />
              {!status.ready && status.needs_more_info && (
                <Button onClick={handleConnect} loading={loading} size="sm">
                  Continue onboarding
                </Button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Set up payouts with Stripe to be paid for completed tasks. Stripe
                checks your identity and bank details; you need this before you
                can start a task.
              </p>
              <Button
                onClick={handleConnect}
                loading={loading}
                disabled={!user?.email_verified}
              >
                Connect with Stripe
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
