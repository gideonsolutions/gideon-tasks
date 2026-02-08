"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import * as usersApi from "@/lib/api/users";

export default function StripeRefreshPage() {
  const router = useRouter();

  useEffect(() => {
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
