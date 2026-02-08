"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function StripeReturnPage() {
  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardContent className="text-center py-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Stripe Setup Complete
          </h2>
          <p className="text-gray-600 mb-4">
            Your Stripe account has been connected. You can now receive payments.
          </p>
          <Link href="/profile/stripe">
            <Button>View Status</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
