import { describe, it, expect } from "vitest";
import {
  MAX_ACTIVE_POSTED,
  MAX_CONCURRENT_DOER,
  MAX_TASK_VALUE_CENTS,
  canApplyForTasks,
  canPostTasks,
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
    expect(clientConstants.TRUST_LEVELS).toEqual({
      MAX_TASK_VALUE_CENTS,
      MAX_CONCURRENT_DOER,
      MAX_ACTIVE_POSTED,
    });
  });
});
