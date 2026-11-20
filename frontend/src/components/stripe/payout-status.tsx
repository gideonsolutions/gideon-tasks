"use client";

import { Badge } from "@/components/ui/badge";
import type { StripeConnectStatus } from "@/lib/types";

function StatusBadge({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return (
    <Badge className={on ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
      {on ? onText : offText}
    </Badge>
  );
}

/** Transfers and payouts badges plus a one-line summary of what is left. */
export function PayoutStatusSummary({ status }: { status: StripeConnectStatus }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Transfers from Gideon Tasks:</span>
        <StatusBadge on={status.transfers_active} onText="Active" offText="Pending" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Payouts to your bank:</span>
        <StatusBadge on={status.payouts_enabled} onText="Enabled" offText="Pending" />
      </div>
      <p className="text-sm text-gray-700">
        {status.ready
          ? "Payouts are set up. You can start tasks and be paid when the requester approves your work."
          : status.needs_more_info
            ? "Stripe still needs some information before you can be paid."
            : "Stripe is reviewing your details. This usually takes a few minutes; check back shortly."}
      </p>
    </div>
  );
}
