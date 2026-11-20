// Trust-level rules. This is the single definition: src/lib/constants.ts
// re-exports it for the UI, so keep this module free of server-only imports.
// The API routes are what enforce these limits.

export const MAX_TASK_VALUE_CENTS: Readonly<Record<number, number>> = {
  0: 10_000,
  1: 50_000,
  2: 200_000,
  3: 500_000,
};

export const MAX_CONCURRENT_DOER: Readonly<Record<number, number>> = {
  0: 2,
  1: 5,
  2: 10,
  3: 20,
};

export const MAX_ACTIVE_POSTED: Readonly<Record<number, number | null>> = {
  0: 2,
  1: 2,
  2: 10,
  3: 25,
};

export function maxTaskValueCents(level: number): number {
  return MAX_TASK_VALUE_CENTS[level] ?? 0;
}

export function maxConcurrentDoer(level: number): number {
  return MAX_CONCURRENT_DOER[level] ?? 0;
}

export function maxActivePosted(level: number): number | null {
  return MAX_ACTIVE_POSTED[level] ?? null;
}

/**
 * Any trust level may post once the account's email address is verified,
 * within that level's limits (level 0: tasks paying up to $100, at most 2
 * active at a time).
 */
export function canPostTasks(level: number, emailVerified: boolean): boolean {
  return emailVerified && maxActivePosted(level) != null;
}

export function canApplyForTasks(level: number, emailVerified: boolean): boolean {
  return emailVerified && level >= 0;
}

// ─── Earning a level ─────────────────────────────────────
//
// Levels are recomputed from these inputs (src/server/trust.ts) when a task
// is approved, when a dispute is resolved, and when an attestation is
// confirmed or revoked.

export interface TrustInputs {
  totalCompleted: number;
  disputesLost: number;
  /** Share of reviews scoring 3+ on every dimension, 0 to 1. */
  positiveReviewRate: number;
  accountAgeDays: number;
  /**
   * The user holds at least one attestation that its attestor has confirmed
   * and not revoked, from an attestor that is still active.
   */
  hasConfirmedAttestation: boolean;
  /** Level 3 also needs an admin's sign-off. */
  adminApprovedLevel3: boolean;
}

export const LEVEL_1_REQUIREMENTS = { completedTasks: 5, accountAgeDays: 30 } as const;
export const LEVEL_2_REQUIREMENTS = {
  completedTasks: 20,
  accountAgeDays: 90,
  positiveReviewRate: 0.9,
} as const;
export const LEVEL_3_REQUIREMENTS = {
  completedTasks: 50,
  accountAgeDays: 180,
  positiveReviewRate: 0.95,
} as const;

/**
 * The attestation rule, deliberately modest: being vouched for by an
 * attestor (a confirmed, unrevoked attestation from an active attestor)
 * halves the completed-task and account-age requirements for level 1, with
 * the task count rounded up (3 tasks, 15 days instead of 5 and 30).
 *
 * It never skips the other conditions: level 1 still requires no lost
 * disputes. It has no effect on levels 2 and 3, which keep their full
 * requirements, including reviews and (for level 3) an admin's sign-off.
 */
export const ATTESTED_LEVEL_1_REQUIREMENTS = {
  completedTasks: Math.ceil(LEVEL_1_REQUIREMENTS.completedTasks / 2),
  accountAgeDays: LEVEL_1_REQUIREMENTS.accountAgeDays / 2,
} as const;

export function computeTrustLevel(i: TrustInputs): number {
  if (
    i.adminApprovedLevel3 &&
    i.totalCompleted >= LEVEL_3_REQUIREMENTS.completedTasks &&
    i.accountAgeDays >= LEVEL_3_REQUIREMENTS.accountAgeDays &&
    i.positiveReviewRate >= LEVEL_3_REQUIREMENTS.positiveReviewRate
  ) {
    return 3;
  }
  if (
    i.totalCompleted >= LEVEL_2_REQUIREMENTS.completedTasks &&
    i.disputesLost === 0 &&
    i.accountAgeDays >= LEVEL_2_REQUIREMENTS.accountAgeDays &&
    i.positiveReviewRate >= LEVEL_2_REQUIREMENTS.positiveReviewRate
  ) {
    return 2;
  }
  const level1 = i.hasConfirmedAttestation ? ATTESTED_LEVEL_1_REQUIREMENTS : LEVEL_1_REQUIREMENTS;
  if (
    i.totalCompleted >= level1.completedTasks &&
    i.disputesLost === 0 &&
    i.accountAgeDays >= level1.accountAgeDays
  ) {
    return 1;
  }
  return 0;
}
