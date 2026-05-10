"use client";

import { useEffect, useState } from "react";
import { calculateFees } from "@/lib/utils/fees";
import { formatCents } from "@/lib/utils/format";
import { GIDEON_FEE_BPS } from "@/lib/constants";
import type { PricingMode } from "@/lib/types";
import * as categoriesApi from "@/lib/api/categories";

interface FeeBreakdownProps {
  /** The dollar amount the requester typed in. */
  anchorCents: number;
  /** Which side of the transaction the anchor describes. */
  pricingMode: PricingMode;
}

export function FeeBreakdownDisplay({
  anchorCents,
  pricingMode,
}: FeeBreakdownProps) {
  const [feeBps, setFeeBps] = useState(GIDEON_FEE_BPS);

  useEffect(() => {
    categoriesApi
      .getCurrentFee()
      .then((res) => setFeeBps(res.fee_bps))
      .catch(() => {});
  }, []);

  const fees = calculateFees(anchorCents, pricingMode, feeBps);
  const feePercent = (feeBps / 100).toFixed(feeBps % 100 === 0 ? 0 : 1);

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
      <h4 className="font-medium text-gray-900 mb-2">Payment breakdown</h4>
      <div className="space-y-1">
        <div className="flex justify-between font-medium">
          <span className="text-gray-700">Requester pays</span>
          <span>{formatCents(fees.total_charged_cents)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span className="pl-3">— Stripe processing</span>
          <span>{formatCents(fees.stripe_fee_cents)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span className="pl-3">— Gideon fee ({feePercent}%)</span>
          <span>{formatCents(fees.gideon_fee_cents)}</span>
        </div>
        <div className="border-t border-gray-300 mt-2 pt-2 flex justify-between font-medium">
          <span className="text-gray-700">Doer receives</span>
          <span className="text-green-600">
            {formatCents(fees.doer_payout_cents)}
          </span>
        </div>
      </div>
    </div>
  );
}
