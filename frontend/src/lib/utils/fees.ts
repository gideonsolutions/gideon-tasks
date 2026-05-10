import type { FeeBreakdown } from "@/lib/types";
import { GIDEON_FEE_BPS, STRIPE_FIXED_CENTS } from "@/lib/constants";

/**
 * Exact mirror of backend `calculateFees` in `src/server/fees.ts`.
 * All integer math — no floating point. The `feeBps` argument is the
 * platform fee in basis points; defaults to `GIDEON_FEE_BPS` when the
 * caller hasn't yet fetched the current tier from `/api/fees/current`.
 */
export function calculateFees(
  taskPriceCents: number,
  feeBps: number = GIDEON_FEE_BPS,
): FeeBreakdown {
  const price = taskPriceCents;
  const gideonFee = Math.floor((price * feeBps) / 10_000);
  const doerPayout = price - gideonFee;
  const subtotal = price + gideonFee;

  const numerator = (subtotal + STRIPE_FIXED_CENTS) * 10_000;
  const totalCharged = Math.ceil(numerator / 9_710);
  const stripeFee = totalCharged - subtotal;

  return {
    task_price_cents: price,
    gideon_fee_cents: gideonFee,
    doer_payout_cents: doerPayout,
    stripe_fee_cents: stripeFee,
    total_charged_cents: totalCharged,
  };
}
