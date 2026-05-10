const STRIPE_FIXED_CENTS = 30n;

export interface FeeBreakdown {
  task_price_cents: number;
  gideon_fee_cents: number;
  doer_payout_cents: number;
  stripe_fee_cents: number;
  total_charged_cents: number;
}

/**
 * Gideon's published fee schedule. Fee tiers down as cumulative platform
 * volume (in dollars of task price) crosses thresholds, with a floor at 1%.
 * The active tier is determined at escrow time, not task post time.
 */
export interface FeeTier {
  /** Lower bound of cumulative platform volume in cents, inclusive. */
  volumeFromCents: number;
  /** Upper bound in cents, exclusive. null = no upper bound. */
  volumeToCents: number | null;
  /** Fee in basis points (100 bps = 1%). */
  bps: number;
}

export const FEE_SCHEDULE: FeeTier[] = [
  { volumeFromCents: 0, volumeToCents: 100_000_000, bps: 500 }, // < $1M → 5%
  { volumeFromCents: 100_000_000, volumeToCents: 200_000_000, bps: 450 }, // $1M – $2M → 4.5%
  { volumeFromCents: 200_000_000, volumeToCents: 500_000_000, bps: 400 }, // $2M – $5M → 4%
  { volumeFromCents: 500_000_000, volumeToCents: 1_000_000_000, bps: 350 }, // $5M – $10M → 3.5%
  { volumeFromCents: 1_000_000_000, volumeToCents: 2_000_000_000, bps: 300 }, // $10M – $20M → 3%
  { volumeFromCents: 2_000_000_000, volumeToCents: 5_000_000_000, bps: 250 }, // $20M – $50M → 2.5%
  { volumeFromCents: 5_000_000_000, volumeToCents: 10_000_000_000, bps: 200 }, // $50M – $100M → 2%
  { volumeFromCents: 10_000_000_000, volumeToCents: 20_000_000_000, bps: 150 }, // $100M – $200M → 1.5%
  { volumeFromCents: 20_000_000_000, volumeToCents: null, bps: 100 }, // $200M+ → 1%
];

export function feeBpsForVolume(volumeCents: number): number {
  for (const tier of FEE_SCHEDULE) {
    if (
      volumeCents >= tier.volumeFromCents &&
      (tier.volumeToCents === null || volumeCents < tier.volumeToCents)
    ) {
      return tier.bps;
    }
  }
  return 100;
}

export const DEFAULT_FEE_BPS = 500;

export function calculateFees(
  taskPriceCents: number,
  feeBps: number = DEFAULT_FEE_BPS,
): FeeBreakdown {
  const price = BigInt(taskPriceCents);
  const bps = BigInt(feeBps);
  const gideonFee = (price * bps) / 10_000n;
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
