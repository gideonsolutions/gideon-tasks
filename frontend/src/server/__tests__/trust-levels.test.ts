import { describe, it, expect } from "vitest";
import {
  ATTESTED_LEVEL_1_REQUIREMENTS,
  LEVEL_1_REQUIREMENTS,
  LEVEL_2_REQUIREMENTS,
  LEVEL_3_REQUIREMENTS,
  MAX_ACTIVE_POSTED,
  MAX_CONCURRENT_DOER,
  MAX_TASK_VALUE_CENTS,
  canApplyForTasks,
  canPostTasks,
  computeTrustLevel,
  maxActivePosted,
  maxConcurrentDoer,
  maxTaskValueCents,
} from "../trust-levels";
import * as clientConstants from "@/lib/constants";

const LEVELS = [0, 1, 2, 3];

describe("canPostTasks", () => {
  it("lets level 0 post once the email is verified", () => {
    expect(canPostTasks(0, true)).toBe(true);
  });

  it.each(LEVELS)("requires a verified email at level %i", (level) => {
    expect(canPostTasks(level, false)).toBe(false);
  });

  it.each([1, 2, 3])("still lets level %i post with a verified email", (level) => {
    expect(canPostTasks(level, true)).toBe(true);
  });

  it.each([-1, 4, 1.5])("refuses unknown level %s", (level) => {
    expect(canPostTasks(level, true)).toBe(false);
  });
});

describe("canApplyForTasks", () => {
  it.each(LEVELS)("lets level %i apply with a verified email", (level) => {
    expect(canApplyForTasks(level, true)).toBe(true);
  });

  it.each(LEVELS)("requires a verified email at level %i", (level) => {
    expect(canApplyForTasks(level, false)).toBe(false);
  });
});

describe("level limits", () => {
  it("caps level 0 at 2 active posted tasks", () => {
    expect(maxActivePosted(0)).toBe(2);
  });

  it("keeps the level 0 task-value cap at $100", () => {
    expect(maxTaskValueCents(0)).toBe(10_000);
  });

  it("leaves the higher levels unchanged", () => {
    expect(LEVELS.map(maxActivePosted)).toEqual([2, 2, 10, 25]);
    expect(LEVELS.map(maxTaskValueCents)).toEqual([10_000, 50_000, 200_000, 500_000]);
    expect(LEVELS.map(maxConcurrentDoer)).toEqual([2, 5, 10, 20]);
  });

  it("gives unknown levels no allowance", () => {
    expect(maxActivePosted(9)).toBeNull();
    expect(maxTaskValueCents(9)).toBe(0);
    expect(maxConcurrentDoer(9)).toBe(0);
  });
});

describe("client constants", () => {
  it("re-export the server rules rather than a copy", () => {
    expect(clientConstants.canPostTasks).toBe(canPostTasks);
    expect(clientConstants.canApplyForTasks).toBe(canApplyForTasks);
    expect(clientConstants.maxActivePosted).toBe(maxActivePosted);
    expect(clientConstants.maxTaskValueCents).toBe(maxTaskValueCents);
    expect(clientConstants.maxConcurrentDoer).toBe(maxConcurrentDoer);
    expect(clientConstants.LEVEL_1_REQUIREMENTS).toBe(LEVEL_1_REQUIREMENTS);
    expect(clientConstants.ATTESTED_LEVEL_1_REQUIREMENTS).toBe(ATTESTED_LEVEL_1_REQUIREMENTS);
    expect(clientConstants.TRUST_LEVELS).toEqual({
      MAX_TASK_VALUE_CENTS,
      MAX_CONCURRENT_DOER,
      MAX_ACTIVE_POSTED,
    });
  });
});

describe("computeTrustLevel", () => {
  const base = {
    totalCompleted: 0,
    disputesLost: 0,
    positiveReviewRate: 0,
    accountAgeDays: 0,
    hasConfirmedAttestation: false,
    adminApprovedLevel3: false,
  };

  /** The rules as they were before attestations counted (src/server/trust.ts). */
  function previousRule(i: typeof base): number {
    if (i.adminApprovedLevel3 && i.totalCompleted >= 50 && i.accountAgeDays >= 180 && i.positiveReviewRate >= 0.95) return 3;
    if (i.totalCompleted >= 20 && i.disputesLost === 0 && i.accountAgeDays >= 90 && i.positiveReviewRate >= 0.9) return 2;
    if (i.totalCompleted >= 5 && i.disputesLost === 0 && i.accountAgeDays >= 30) return 1;
    return 0;
  }

  it("states the attestation rule: half the tasks (rounded up) and half the age for level 1", () => {
    expect(LEVEL_1_REQUIREMENTS).toEqual({ completedTasks: 5, accountAgeDays: 30 });
    expect(ATTESTED_LEVEL_1_REQUIREMENTS).toEqual({ completedTasks: 3, accountAgeDays: 15 });
  });

  it("is unchanged for everyone without an attestation", () => {
    for (const totalCompleted of [0, 2, 3, 4, 5, 19, 20, 49, 50]) {
      for (const accountAgeDays of [0, 14.9, 15, 29.9, 30, 89, 90, 179, 180]) {
        for (const disputesLost of [0, 1]) {
          for (const positiveReviewRate of [0, 0.89, 0.9, 0.94, 0.95, 1]) {
            for (const adminApprovedLevel3 of [false, true]) {
              const i = { ...base, totalCompleted, accountAgeDays, disputesLost, positiveReviewRate, adminApprovedLevel3 };
              expect(computeTrustLevel(i)).toBe(previousRule(i));
            }
          }
        }
      }
    }
  });

  it("lets an attested member reach level 1 with 3 tasks and a 15-day account", () => {
    const attested = { ...base, hasConfirmedAttestation: true };
    expect(computeTrustLevel({ ...attested, totalCompleted: 3, accountAgeDays: 15 })).toBe(1);
    expect(computeTrustLevel({ ...base, totalCompleted: 3, accountAgeDays: 15 })).toBe(0);
  });

  it("still needs both halved requirements", () => {
    const attested = { ...base, hasConfirmedAttestation: true };
    expect(computeTrustLevel({ ...attested, totalCompleted: 2, accountAgeDays: 400 })).toBe(0);
    expect(computeTrustLevel({ ...attested, totalCompleted: 40, accountAgeDays: 14.9 })).toBe(0);
  });

  it("never skips the no-lost-disputes condition", () => {
    const attested = { ...base, hasConfirmedAttestation: true, totalCompleted: 10, accountAgeDays: 60 };
    expect(computeTrustLevel({ ...attested, disputesLost: 1 })).toBe(0);
  });

  it("does not affect level 2", () => {
    const nearlyTwo = { ...base, totalCompleted: 19, accountAgeDays: 89, positiveReviewRate: 1 };
    expect(computeTrustLevel({ ...nearlyTwo, hasConfirmedAttestation: true })).toBe(1);
    // Half the level 2 requirements is not enough with an attestation.
    expect(
      computeTrustLevel({ ...base, hasConfirmedAttestation: true, totalCompleted: 10, accountAgeDays: 45, positiveReviewRate: 1 }),
    ).toBe(1);
    // The review condition for level 2 still applies.
    expect(
      computeTrustLevel({ ...base, hasConfirmedAttestation: true, totalCompleted: 20, accountAgeDays: 90, positiveReviewRate: 0.89 }),
    ).toBe(1);
    expect(
      computeTrustLevel({ ...base, totalCompleted: LEVEL_2_REQUIREMENTS.completedTasks, accountAgeDays: 90, positiveReviewRate: 0.9 }),
    ).toBe(2);
  });

  it("does not affect level 3, which still needs an admin", () => {
    const pillar = {
      ...base,
      totalCompleted: LEVEL_3_REQUIREMENTS.completedTasks,
      accountAgeDays: LEVEL_3_REQUIREMENTS.accountAgeDays,
      positiveReviewRate: LEVEL_3_REQUIREMENTS.positiveReviewRate,
      hasConfirmedAttestation: true,
    };
    expect(computeTrustLevel(pillar)).toBe(2);
    expect(computeTrustLevel({ ...pillar, adminApprovedLevel3: true })).toBe(3);
    expect(computeTrustLevel({ ...pillar, totalCompleted: 25, adminApprovedLevel3: true })).toBe(2);
  });
});
