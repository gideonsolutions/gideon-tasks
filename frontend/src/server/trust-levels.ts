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
