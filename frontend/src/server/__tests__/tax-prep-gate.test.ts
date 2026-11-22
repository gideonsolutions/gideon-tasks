import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({ queryOne: vi.fn() }));
vi.mock("../db", () => db);

import { requireTaxQualification } from "../tax-prep-gate";
import { CREDENTIAL_REQUIRED, PTIN_REQUIRED } from "../tax-preparers";
import { AppError } from "../errors";

const userId = "0190d0c0-0000-7000-8000-0000000000e1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("requireTaxQualification", () => {
  it("doesn't look anyone up outside Tax Prep", async () => {
    for (const slug of ["cleaning", "tutoring", null, undefined]) {
      await expect(requireTaxQualification(userId, slug)).resolves.toBeUndefined();
    }
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("passes a preparer with a PTIN recorded for this year, without reading the PTIN", async () => {
    db.queryOne.mockResolvedValue({ status: "active", has_ptin: true, ptin_year: 2026, tax_credential: null });
    await expect(requireTaxQualification(userId, "tax-prep")).resolves.toBeUndefined();
    const [sql, params] = db.queryOne.mock.calls[0];
    expect(params).toEqual([userId]);
    expect(sql).toContain("(ptin IS NOT NULL) AS has_ptin");
    expect(sql).not.toMatch(/SELECT[^]*\bptin,/);
  });

  it.each([
    ["no PTIN", { status: "active", has_ptin: false, ptin_year: null, tax_credential: null }],
    ["last year's PTIN", { status: "active", has_ptin: true, ptin_year: 2025, tax_credential: "cpa" }],
    ["a banned account", { status: "banned", has_ptin: true, ptin_year: 2026, tax_credential: null }],
    ["no such user", null],
  ])("refuses %s with 403", async (_label, row) => {
    db.queryOne.mockResolvedValue(row);
    const err = await requireTaxQualification(userId, "tax-prep").catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe(PTIN_REQUIRED);
  });

  it("on IRS Notices & Representation, passes an enrolled agent with a current PTIN", async () => {
    db.queryOne.mockResolvedValue({ status: "active", has_ptin: true, ptin_year: 2026, tax_credential: "enrolled_agent" });
    await expect(requireTaxQualification(userId, "irs-help")).resolves.toBeUndefined();
  });

  it.each([
    ["a PTIN but no credential", { status: "active", has_ptin: true, ptin_year: 2026, tax_credential: null }],
    ["a CPA whose PTIN lapsed", { status: "active", has_ptin: true, ptin_year: 2025, tax_credential: "cpa" }],
    ["an attorney with no PTIN", { status: "active", has_ptin: false, ptin_year: null, tax_credential: "attorney" }],
  ])("on IRS Notices & Representation, refuses %s with 403", async (_label, row) => {
    db.queryOne.mockResolvedValue(row);
    const err = await requireTaxQualification(userId, "irs-help").catch((e) => e);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).message).toBe(CREDENTIAL_REQUIRED);
  });
});
