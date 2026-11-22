// Tax preparers on Gideon Tasks: the PTIN an admin records, the credential
// shown as a badge, and which categories need them. Pure (no database), so
// the pages and the API share one definition. The policy is on /tax-prep.
//
// The PTIN rule. 26 CFR 1.6109-2(d): "all tax return preparers must have a
// preparer tax identification number". 1.6109-2(g): for (d), a tax return
// preparer is "any individual who is compensated for preparing, or assisting
// in the preparation of, all or substantially all of a tax return or claim
// for refund of tax".
//   https://www.ecfr.gov/current/title-26/section-1.6109-2
// Renewal. 1.6109-2(e) lets the IRS set an expiration date, and the IRS
// says: "All PTINs expire on Dec. 31 of each year and are required to be
// renewed to be current and active."
//   https://www.irs.gov/tax-professionals/frequently-asked-questions-ptin-application-renewal-assistance
// So a recorded PTIN carries the calendar year it was verified for, and only
// a PTIN recorded for the current calendar year (UTC) qualifies.

/** The Tax Prep category's slug (see seed.ts). */
export const TAX_PREP_SLUG = "tax-prep";

export type TaxCredential = "enrolled_agent" | "cpa" | "attorney";

export const TAX_CREDENTIALS: readonly TaxCredential[] = ["enrolled_agent", "cpa", "attorney"];

/** The badge for each credential. */
export const TAX_CREDENTIAL_LABELS: Record<TaxCredential, string> = {
  enrolled_agent: "Enrolled Agent",
  cpa: "CPA",
  attorney: "Attorney",
};

export function isTaxCredential(v: unknown): v is TaxCredential {
  return typeof v === "string" && (TAX_CREDENTIALS as readonly string[]).includes(v);
}

/** The calendar year in UTC. */
export function utcYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

/**
 * A PTIN is "P" followed by eight digits; P00000000 and P99999999 are not
 * valid. IRM 3.12.213, paid preparer's PTIN: "The range for a valid PTIN is
 * P00000001 through P99999998."
 *   https://www.irs.gov/irm/part3/irm_03-012-213r
 * Returns the PTIN in upper case, or null if it isn't one.
 */
export function normalizePtin(input: string): string | null {
  const p = input.trim().toUpperCase();
  if (!/^P\d{8}$/.test(p)) return null;
  if (p === "P00000000" || p === "P99999999") return null;
  return p;
}

/** What a user's account says about them as a preparer. The PTIN itself is never needed here. */
export interface PreparerState {
  status: string;
  /** Whether a PTIN is recorded (any year). */
  has_ptin: boolean;
  /** The calendar year the recorded PTIN was verified for. */
  ptin_year: number | string | null;
  tax_credential: string | null;
}

/** SELECT list for PreparerState from `users` (or an alias, e.g. "u."). */
export function preparerColumns(alias = ""): string {
  return `${alias}status, (${alias}ptin IS NOT NULL) AS has_ptin, ${alias}ptin_year, ${alias}tax_credential`;
}

/** Whether a PTIN is recorded for the current calendar year (UTC). */
export function hasCurrentPtin(
  u: Pick<PreparerState, "has_ptin" | "ptin_year"> | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!u && u.has_ptin && u.ptin_year != null && Number(u.ptin_year) === utcYear(now);
}

/** What a category asks of the person who applies, asks, or is booked. */
export type TaxRequirement = "ptin";

/** The requirement for a category, or null if it has none. */
export function taxRequirement(categorySlug: string | null | undefined): TaxRequirement | null {
  if (categorySlug === TAX_PREP_SLUG) return "ptin";
  return null;
}

/** Whether the user meets the requirement: an active account with a current PTIN. */
export function meetsTaxRequirement(
  requirement: TaxRequirement | null,
  u: PreparerState | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!requirement) return true;
  return !!u && u.status === "active" && hasCurrentPtin(u, now);
}

export const PTIN_REQUIRED =
  "Only preparers whose PTIN Gideon Tasks has recorded for this calendar year can apply to, ask about, or be booked for Tax Prep tasks. See /tax-prep";

/** The 403 message when the requirement isn't met. */
export function taxRequirementMessage(requirement: TaxRequirement): string {
  switch (requirement) {
    case "ptin":
      return PTIN_REQUIRED;
  }
}

/**
 * What everyone may see about a user as a preparer: their credential and the
 * year their PTIN is on file for, if it is the current year. Never the PTIN.
 * Nothing for an account that isn't active.
 */
export interface PreparerBadges {
  tax_credential: TaxCredential | null;
  /** The current year, if a PTIN is recorded for it; otherwise null. */
  ptin_year: number | null;
}

export function publicPreparerBadges(
  u: PreparerState | null | undefined,
  now: Date = new Date(),
): PreparerBadges {
  if (!u || u.status !== "active") return { tax_credential: null, ptin_year: null };
  return {
    tax_credential: isTaxCredential(u.tax_credential) ? u.tax_credential : null,
    ptin_year: hasCurrentPtin(u, now) ? utcYear(now) : null,
  };
}

/** The badge texts, e.g. ["Enrolled Agent", "PTIN on file for 2026"]. */
export function preparerBadgeLabels(b: PreparerBadges): string[] {
  const out: string[] = [];
  if (b.tax_credential) out.push(TAX_CREDENTIAL_LABELS[b.tax_credential]);
  if (b.ptin_year != null) out.push(`PTIN on file for ${b.ptin_year}`);
  return out;
}
