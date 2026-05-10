const GIDEON_FEE_BPS = 100n;
const STRIPE_FIXED_CENTS = 30n;

export interface FeeBreakdown {
  task_price_cents: number;
  gideon_fee_cents: number;
  doer_payout_cents: number;
  stripe_fee_cents: number;
  total_charged_cents: number;
}

export function calculateFees(taskPriceCents: number): FeeBreakdown {
  const price = BigInt(taskPriceCents);
  const gideonFee = (price * GIDEON_FEE_BPS) / 10_000n;
  const doerPayout = price - gideonFee;
  const subtotal = price + gideonFee;

  const numerator = (subtotal + STRIPE_FIXED_CENTS) * 10_000n;
  const totalCharged = (numerator + 9_710n - 1n) / 9_710n;
  const stripeFee = totalCharged - subtotal;

  return {
    task_price_cents: Number(price),
    gideon_fee_cents: Number(gideonFee),
    doer_payout_cents: Number(doerPayout),
    stripe_fee_cents: Number(stripeFee),
    total_charged_cents: Number(totalCharged),
  };
}

export const MIN_TASK_PRICE_CENTS = 500;
