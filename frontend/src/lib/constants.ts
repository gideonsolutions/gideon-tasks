// Hard-coded constants matching backend

export const GIDEON_FEE_BPS = 100; // 1% = 100 basis points
export const STRIPE_RATE_BPS = 290; // 2.9%
export const STRIPE_FIXED_CENTS = 30; // $0.30
export const MIN_TASK_PRICE_CENTS = 500; // $5.00

// Trust level limits
export const TRUST_LEVELS = {
  MAX_TASK_VALUE_CENTS: {
    0: 10_000, // $100
    1: 50_000, // $500
    2: 200_000, // $2,000
    3: 500_000, // $5,000
  } as Record<number, number>,

  MAX_CONCURRENT_DOER: {
    0: 2,
    1: 5,
    2: 10,
    3: 20,
  } as Record<number, number>,

  MAX_ACTIVE_POSTED: {
    0: null, // Cannot post
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

// Trust level names
export const TRUST_LEVEL_NAMES: Record<number, string> = {
  0: "Verified",
  1: "Established",
  2: "Trusted",
  3: "Pillar",
};

// Task statuses
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

// Review window: 7 days after completion
export const REVIEW_WINDOW_DAYS = 7;
