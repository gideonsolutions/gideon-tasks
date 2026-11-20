"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import * as usersApi from "@/lib/api/users";

/**
 * Stripe's refresh_url: the onboarding link expired or was already used.
 * Ask for a new link and go straight back to Stripe.
 */
export default function StripeRefreshPage() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    // Account links are single-use; do not create two in development's
    // double-run of effects.
    if (started.current) return;
    started.current = true;
    usersApi
      .initiateStripeConnect()
      .then((res) => {
        window.location.href = res.url;
      })
      .catch(() => {
        router.push("/profile/stripe");
      });
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <Spinner size="lg" />
      <p className="text-gray-600">Redirecting to Stripe...</p>
    </div>
  );
}
