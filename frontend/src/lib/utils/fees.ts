import type { FeeBreakdown } from "@/lib/types";
import { GIDEON_FEE_BPS, STRIPE_FIXED_CENTS } from "@/lib/constants";

/**
 * Exact port of backend `FeeBreakdown::calculate` from `models/payment.rs`.
 * All integer math — no floating point.
 */
export function calculateFees(taskPriceCents: number): FeeBreakdown {
  const price = taskPriceCents;

  // Gideon fee: exactly 1%, integer division rounds down (favors user)
  const gideonFee = Math.floor((price * GIDEON_FEE_BPS) / 10_000);
  const doerPayout = price - gideonFee;
  const subtotal = price + gideonFee;

  // Stripe fee: reverse-engineer total so Stripe takes its cut
  // total = ceil((subtotal + 30) / (1 - 0.029))
  // 1 - 0.029 = 0.971 → multiply by 10000, divide by 9710
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
