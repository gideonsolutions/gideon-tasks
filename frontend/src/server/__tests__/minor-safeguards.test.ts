import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ queryOne: vi.fn() }));
vi.mock("../db", () => db);

import {
  BACKGROUND_CHECK_REQUIRED,
  mayTutorMinors,
  minorTaskProblem,
  requireBackgroundCheck,
} from "../minor-safeguards";
import { AppError } from "../errors";

beforeEach(() => vi.clearAllMocks());

describe("minorTaskProblem", () => {
  it("has nothing to say about a task that isn't for a child", () => {
    expect(
      minorTaskProblem({ forMinor: false, categorySlug: "cleaning", locationType: "in_person" }),
    ).toBeNull();
  });

  it("allows a remote Tutoring task for a child", () => {
    expect(
      minorTaskProblem({ forMinor: true, categorySlug: "tutoring", locationType: "remote" }),
    ).toBeNull();
  });

  it("allows an in-person one only when the poster confirms a public place", () => {
    const inPerson = { forMinor: true, categorySlug: "tutoring", locationType: "in_person" } as const;
    expect(minorTaskProblem(inPerson)).toMatch(/public place/);
    expect(minorTaskProblem({ ...inPerson, publicPlaceConfirmed: false })).toMatch(/public place/);
    expect(minorTaskProblem({ ...inPerson, publicPlaceConfirmed: true })).toBeNull();
  });

  it.each(["cleaning", "other", null, undefined])(
    "refuses the tick outside Tutoring (%s)",
    (categorySlug) => {
      expect(
        minorTaskProblem({ forMinor: true, categorySlug, locationType: "remote" }),
      ).toMatch(/Only a Tutoring task/);
    },
  );
});

describe("mayTutorMinors", () => {
  const cleared = { status: "active", background_check_cleared_at: "2026-11-20T15:00:00Z" };

  it("needs an active account with a recorded check", () => {
    expect(mayTutorMinors(cleared)).toBe(true);
    expect(mayTutorMinors({ ...cleared, background_check_cleared_at: null })).toBe(false);
    expect(mayTutorMinors({ ...cleared, status: "suspended" })).toBe(false);
    expect(mayTutorMinors({ ...cleared, status: "banned" })).toBe(false);
    expect(mayTutorMinors(null)).toBe(false);
  });
});

describe("requireBackgroundCheck", () => {
  const userId = "0190d0c0-0000-7000-8000-0000000000d1";

  it("passes for a user with a recorded check", async () => {
    db.queryOne.mockResolvedValue({ status: "active", background_check_cleared_at: new Date() });
    await expect(requireBackgroundCheck(userId)).resolves.toBeUndefined();
    expect(db.queryOne.mock.calls[0][1]).toEqual([userId]);
  });

  it.each([
    ["no check recorded", { status: "active", background_check_cleared_at: null }],
    ["no such user", null],
  ])("refuses with 403 when there is %s", async (_label, row) => {
    db.queryOne.mockResolvedValue(row);
    const err = await requireBackgroundCheck(userId).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe(BACKGROUND_CHECK_REQUIRED);
  });
});
