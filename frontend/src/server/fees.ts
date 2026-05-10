const STRIPE_FIXED_CENTS = 30n;
const STRIPE_RATE_BPS = 290n;

export interface FeeBreakdown {
  anchor_cents: number;
  total_charged_cents: number;
  stripe_fee_cents: number;
  gideon_fee_cents: number;
  doer_payout_cents: number;
}

export type PricingMode = "doer_receives" | "requester_pays";

export interface FeeTier {
  volumeFromCents: number;
  volumeToCents: number | null;
  bps: number;
}

export const FEE_SCHEDULE: FeeTier[] = [
  { volumeFromCents: 0, volumeToCents: 100_000_000, bps: 500 },
  { volumeFromCents: 100_000_000, volumeToCents: 200_000_000, bps: 450 },
  { volumeFromCents: 200_000_000, volumeToCents: 500_000_000, bps: 400 },
  { volumeFromCents: 500_000_000, volumeToCents: 1_000_000_000, bps: 350 },
  { volumeFromCents: 1_000_000_000, volumeToCents: 2_000_000_000, bps: 300 },
  { volumeFromCents: 2_000_000_000, volumeToCents: 5_000_000_000, bps: 250 },
  { volumeFromCents: 5_000_000_000, volumeToCents: 10_000_000_000, bps: 200 },
  { volumeFromCents: 10_000_000_000, volumeToCents: 20_000_000_000, bps: 150 },
  { volumeFromCents: 20_000_000_000, volumeToCents: null, bps: 100 },
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

function ceilDivBig(num: bigint, den: bigint): bigint {
  return (num + den - 1n) / den;
}

/**
 * Single Gideon fee, never double-deducted.
 *
 * `doer_receives`: anchor = what the doer gets. Requester pays a higher total
 *   covering Gideon + Stripe fees.
 *
 * `requester_pays`: anchor = total the requester pays. Stripe and Gideon
 *   fees come out of that total; doer gets the remainder.
 */
export function calculateFees(
  anchorCents: number,
  mode: PricingMode = "doer_receives",
  feeBps: number = DEFAULT_FEE_BPS,
): FeeBreakdown {
  const anchor = BigInt(anchorCents);
  const bps = BigInt(feeBps);

  if (mode === "doer_receives") {
    const doerPayout = anchor;
    const gideonFee = (doerPayout * bps) / 10_000n;
    const subtotal = doerPayout + gideonFee;
    const totalCharged = ceilDivBig((subtotal + STRIPE_FIXED_CENTS) * 10_000n, 9_710n);
    const stripeFee = totalCharged - subtotal;
    return {
      anchor_cents: Number(anchor),
      total_charged_cents: Number(totalCharged),
      stripe_fee_cents: Number(stripeFee),
      gideon_fee_cents: Number(gideonFee),
      doer_payout_cents: Number(doerPayout),
    };
  }

  const totalCharged = anchor;
  const stripeFee =
    ceilDivBig(totalCharged * STRIPE_RATE_BPS, 10_000n) + STRIPE_FIXED_CENTS;
  const subtotal = totalCharged - stripeFee;
  if (subtotal <= 0n) {
    return {
      anchor_cents: Number(anchor),
      total_charged_cents: Number(totalCharged),
      stripe_fee_cents: Number(stripeFee),
      gideon_fee_cents: 0,
      doer_payout_cents: 0,
    };
  }
  const doerPayout = ceilDivBig(subtotal * 10_000n, 10_000n + bps);
  const gideonFee = subtotal - doerPayout;
  return {
    anchor_cents: Number(anchor),
    total_charged_cents: Number(totalCharged),
    stripe_fee_cents: Number(stripeFee),
    gideon_fee_cents: Number(gideonFee),
    doer_payout_cents: Number(doerPayout),
  };
}

export const MIN_TASK_PRICE_CENTS = 500;
