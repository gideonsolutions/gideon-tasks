import { describe, it, expect } from "vitest";
import {
  hasCurrentPtin,
  meetsTaxRequirement,
  normalizePtin,
  preparerBadgeLabels,
  publicPreparerBadges,
  PTIN_REQUIRED,
  taxRequirement,
  taxRequirementMessage,
  TAX_PREP_SLUG,
  utcYear,
  type PreparerState,
} from "../tax-preparers";
import { userSelfView } from "../user-self-view";

const NOV_2026 = new Date("2026-11-21T15:00:00Z");

const current: PreparerState = {
  status: "active",
  has_ptin: true,
  ptin_year: 2026,
  tax_credential: null,
};

describe("utcYear", () => {
  it("is the calendar year in UTC", () => {
    expect(utcYear(NOV_2026)).toBe(2026);
  });

  it("turns over at midnight UTC, not local midnight", () => {
    // 11:30 pm on December 31 in New York is already January 1 in UTC.
    expect(utcYear(new Date("2026-12-31T23:30:00-05:00"))).toBe(2027);
    expect(utcYear(new Date("2026-12-31T23:59:59Z"))).toBe(2026);
    expect(utcYear(new Date("2027-01-01T00:00:00Z"))).toBe(2027);
  });
});

describe("hasCurrentPtin", () => {
  it("is true for a PTIN recorded for the current calendar year", () => {
    expect(hasCurrentPtin(current, NOV_2026)).toBe(true);
  });

  it("accepts the year as the database's string", () => {
    expect(hasCurrentPtin({ has_ptin: true, ptin_year: "2026" }, NOV_2026)).toBe(true);
  });

  it("lapses when the year ends (PTINs expire on December 31)", () => {
    expect(hasCurrentPtin(current, new Date("2026-12-31T23:59:59Z"))).toBe(true);
    expect(hasCurrentPtin(current, new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });

  it.each([
    ["last year's PTIN", { has_ptin: true, ptin_year: 2025 }],
    ["next year's PTIN", { has_ptin: true, ptin_year: 2027 }],
    ["no PTIN", { has_ptin: false, ptin_year: null }],
    ["a year without a PTIN", { has_ptin: false, ptin_year: 2026 }],
    ["no record", null],
  ])("is false for %s", (_label, u) => {
    expect(hasCurrentPtin(u, NOV_2026)).toBe(false);
  });
});

describe("normalizePtin", () => {
  it("accepts P and eight digits, in either case and with spaces around", () => {
    expect(normalizePtin("P01234567")).toBe("P01234567");
    expect(normalizePtin(" p01234567 ")).toBe("P01234567");
    expect(normalizePtin("P00000001")).toBe("P00000001");
    expect(normalizePtin("P99999998")).toBe("P99999998");
  });

  it.each(["P0123456", "P012345678", "01234567", "123456789", "P-01234567", "X01234567", "P00000000", "P99999999", ""])(
    "refuses %j",
    (input) => {
      expect(normalizePtin(input)).toBeNull();
    },
  );
});

describe("taxRequirement and meetsTaxRequirement", () => {
  it("asks for a PTIN in Tax Prep only", () => {
    expect(taxRequirement(TAX_PREP_SLUG)).toBe("ptin");
    for (const slug of ["tutoring", "cleaning", "other", null, undefined]) {
      expect(taxRequirement(slug)).toBeNull();
    }
  });

  it("lets anyone through where there is no requirement", () => {
    expect(meetsTaxRequirement(null, null, NOV_2026)).toBe(true);
  });

  it("needs an active account with a current PTIN for Tax Prep", () => {
    expect(meetsTaxRequirement("ptin", current, NOV_2026)).toBe(true);
    expect(meetsTaxRequirement("ptin", { ...current, ptin_year: 2025 }, NOV_2026)).toBe(false);
    expect(meetsTaxRequirement("ptin", { ...current, has_ptin: false }, NOV_2026)).toBe(false);
    expect(meetsTaxRequirement("ptin", { ...current, status: "suspended" }, NOV_2026)).toBe(false);
    expect(meetsTaxRequirement("ptin", { ...current, status: "banned" }, NOV_2026)).toBe(false);
    expect(meetsTaxRequirement("ptin", null, NOV_2026)).toBe(false);
  });

  it("says why", () => {
    expect(taxRequirementMessage("ptin")).toBe(PTIN_REQUIRED);
    expect(PTIN_REQUIRED).toMatch(/\/tax-prep/);
  });
});

describe("publicPreparerBadges", () => {
  it("shows the credential and the current year, never the PTIN", () => {
    const badges = publicPreparerBadges(
      { ...current, tax_credential: "enrolled_agent", ptin: "P01234567" } as PreparerState,
      NOV_2026,
    );
    expect(badges).toEqual({ tax_credential: "enrolled_agent", ptin_year: 2026 });
    expect(JSON.stringify(badges)).not.toContain("P01234567");
    expect(preparerBadgeLabels(badges)).toEqual(["Enrolled Agent", "PTIN on file for 2026"]);
  });

  it("drops a lapsed PTIN but keeps the credential", () => {
    const badges = publicPreparerBadges({ ...current, ptin_year: 2025, tax_credential: "cpa" }, NOV_2026);
    expect(badges).toEqual({ tax_credential: "cpa", ptin_year: null });
    expect(preparerBadgeLabels(badges)).toEqual(["CPA"]);
  });

  it("shows nothing for an account that isn't active", () => {
    expect(
      publicPreparerBadges({ ...current, status: "banned", tax_credential: "attorney" }, NOV_2026),
    ).toEqual({ tax_credential: null, ptin_year: null });
  });

  it("ignores a credential it doesn't know", () => {
    expect(publicPreparerBadges({ ...current, tax_credential: "wizard" }, NOV_2026).tax_credential).toBeNull();
  });

  it("labels each credential", () => {
    expect(preparerBadgeLabels({ tax_credential: "attorney", ptin_year: null })).toEqual(["Attorney"]);
    expect(preparerBadgeLabels({ tax_credential: null, ptin_year: null })).toEqual([]);
  });
});

describe("userSelfView", () => {
  it("leaves out what only admins see, and says whether a PTIN is recorded", () => {
    const view = userSelfView({
      id: "u1",
      email: "kitty@example.com",
      password_hash: "bcrypt",
      background_check_note: "Report reviewed",
      ptin: "P01234567",
      ptin_year: 2026,
      ptin_note: "Directory checked",
      ptin_recorded_by: "admin-1",
      tax_credential: "cpa",
      tax_credential_note: "State board checked",
      tax_credential_recorded_by: "admin-1",
    });
    expect(view).toEqual({
      id: "u1",
      email: "kitty@example.com",
      has_ptin: true,
      ptin_year: 2026,
      tax_credential: "cpa",
    });
  });

  it("says no PTIN when there is none", () => {
    expect(userSelfView({ id: "u1", ptin: null }).has_ptin).toBe(false);
  });
});
