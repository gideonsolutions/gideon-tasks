import type { FeeBreakdown, PricingMode } from "@/lib/types";
import { GIDEON_FEE_BPS, STRIPE_FIXED_CENTS, STRIPE_RATE_BPS } from "@/lib/constants";

/**
 * Mirror of backend `calculateFees` in `src/server/fees.ts`.
 * Single Gideon fee — never double-deducted. All integer math.
 */
export function calculateFees(
  anchorCents: number,
  mode: PricingMode = "doer_receives",
  feeBps: number = GIDEON_FEE_BPS,
): FeeBreakdown {
  if (mode === "doer_receives") {
    const doerPayout = anchorCents;
    const gideonFee = Math.floor((doerPayout * feeBps) / 10_000);
    const subtotal = doerPayout + gideonFee;
    const totalCharged = Math.ceil(((subtotal + STRIPE_FIXED_CENTS) * 10_000) / 9_710);
    const stripeFee = totalCharged - subtotal;
    return {
      anchor_cents: anchorCents,
      total_charged_cents: totalCharged,
      stripe_fee_cents: stripeFee,
      gideon_fee_cents: gideonFee,
      doer_payout_cents: doerPayout,
    };
  }

  const totalCharged = anchorCents;
  const stripeFee = Math.ceil((totalCharged * STRIPE_RATE_BPS) / 10_000) + STRIPE_FIXED_CENTS;
  const subtotal = totalCharged - stripeFee;
  if (subtotal <= 0) {
    return {
      anchor_cents: anchorCents,
      total_charged_cents: totalCharged,
      stripe_fee_cents: stripeFee,
      gideon_fee_cents: 0,
      doer_payout_cents: 0,
    };
  }
  const doerPayout = Math.ceil((subtotal * 10_000) / (10_000 + feeBps));
  const gideonFee = subtotal - doerPayout;
  return {
    anchor_cents: anchorCents,
    total_charged_cents: totalCharged,
    stripe_fee_cents: stripeFee,
    gideon_fee_cents: gideonFee,
    doer_payout_cents: doerPayout,
  };
}
