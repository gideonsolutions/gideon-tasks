"use client";

import { useState } from "react";
import { initiateStripeConnect } from "@/lib/api/users";
import type { ApiError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

export function ConnectOnboarding() {
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  async function handleConnect() {
    setLoading(true);
    try {
      const { url } = await initiateStripeConnect();
      window.location.href = url;
    } catch (err) {
      const apiError = err as ApiError;
      addToast(apiError.error ?? "Failed to initiate Stripe Connect", "error");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stripe Connect</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-gray-600">
          Connect your Stripe account to receive payments for completed tasks.
          You will be redirected to Stripe to complete the onboarding process.
        </p>
        <Button loading={loading} onClick={handleConnect}>
          Connect with Stripe
        </Button>
      </CardContent>
    </Card>
  );
}
