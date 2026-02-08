import { calculateFees } from "@/lib/utils/fees";
import { formatCents } from "@/lib/utils/format";

interface FeeBreakdownProps {
  priceCents: number;
}

export function FeeBreakdownDisplay({ priceCents }: FeeBreakdownProps) {
  const fees = calculateFees(priceCents);

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
      <h4 className="font-medium text-gray-900 mb-2">Fee Breakdown</h4>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600">Task Price</span>
          <span className="font-medium">{formatCents(fees.task_price_cents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Gideon Fee (1%)</span>
          <span>{formatCents(fees.gideon_fee_cents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Doer Receives</span>
          <span className="text-green-600 font-medium">
            {formatCents(fees.doer_payout_cents)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Payment Processing</span>
          <span>{formatCents(fees.stripe_fee_cents)}</span>
        </div>
        <div className="border-t border-gray-300 mt-2 pt-2 flex justify-between font-medium">
          <span>Total Charged</span>
          <span>{formatCents(fees.total_charged_cents)}</span>
        </div>
      </div>
    </div>
  );
}
