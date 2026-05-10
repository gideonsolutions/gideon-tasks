const MAX_TASK_VALUE_CENTS: Record<number, number> = {
  0: 10_000,
  1: 50_000,
  2: 200_000,
  3: 500_000,
};

const MAX_CONCURRENT_DOER: Record<number, number> = {
  0: 2,
  1: 5,
  2: 10,
  3: 20,
};

const MAX_ACTIVE_POSTED: Record<number, number | null> = {
  0: null,
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

export function canPostTasks(level: number): boolean {
  return level >= 1;
}

export function canApplyForTasks(level: number): boolean {
  return level >= 0;
}
