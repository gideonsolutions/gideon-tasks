// Hard-coded constants matching backend

/** Default Gideon fee — used for client-side previews before /fees/current loads. */
export const GIDEON_FEE_BPS = 500;
export const STRIPE_RATE_BPS = 290; // 2.9%
export const STRIPE_FIXED_CENTS = 30; // $0.30
export const MIN_TASK_PRICE_CENTS = 500; // $5.00

/** Published fee staircase, mirrored from backend `src/server/fees.ts`. */
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

// Trust level limits
export const TRUST_LEVELS = {
  MAX_TASK_VALUE_CENTS: {
    0: 10_000,
    1: 50_000,
    2: 200_000,
    3: 500_000,
  } as Record<number, number>,

  MAX_CONCURRENT_DOER: {
    0: 2,
    1: 5,
    2: 10,
    3: 20,
  } as Record<number, number>,

  MAX_ACTIVE_POSTED: {
    0: null,
    1: 2,
    2: 10,
    3: 25,
  } as Record<number, number | null>,
};

export function canPostTasks(level: number): boolean {
  return level >= 1;
}

export function canApplyForTasks(level: number): boolean {
  return level >= 0;
}

export function maxTaskValueCents(level: number): number {
  return TRUST_LEVELS.MAX_TASK_VALUE_CENTS[level] ?? 0;
}

export function maxConcurrentDoer(level: number): number {
  return TRUST_LEVELS.MAX_CONCURRENT_DOER[level] ?? 0;
}

export function maxActivePosted(level: number): number | null {
  return TRUST_LEVELS.MAX_ACTIVE_POSTED[level] ?? null;
}

export const TRUST_LEVEL_NAMES: Record<number, string> = {
  0: "Verified",
  1: "Established",
  2: "Trusted",
  3: "Pillar",
};

export const TASK_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "assigned",
  "in_progress",
  "submitted",
  "completed",
  "disputed",
  "resolved",
  "cancelled",
  "expired",
  "rejected",
] as const;

export const REVIEW_WINDOW_DAYS = 7;
