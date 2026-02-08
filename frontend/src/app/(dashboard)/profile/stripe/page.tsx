"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import * as usersApi from "@/lib/api/users";
import type { ApiError } from "@/lib/types";

export default function StripeConnectPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const { data: status, loading: statusLoading } = useApi(
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

      <Card>
        <CardHeader>
          <CardTitle>Payment Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : user?.stripe_connect_account_id ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Charges:</span>
                <Badge
                  className={
                    status?.charges_enabled
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }
                >
                  {status?.charges_enabled ? "Enabled" : "Pending"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Payouts:</span>
                <Badge
                  className={
                    status?.payouts_enabled
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }
                >
                  {status?.payouts_enabled ? "Enabled" : "Pending"}
                </Badge>
              </div>
              {(!status?.charges_enabled || !status?.payouts_enabled) && (
                <Button onClick={handleConnect} loading={loading} size="sm">
                  Complete Onboarding
                </Button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Connect your Stripe account to receive payments for completed tasks.
              </p>
              <Button onClick={handleConnect} loading={loading}>
                Connect with Stripe
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
