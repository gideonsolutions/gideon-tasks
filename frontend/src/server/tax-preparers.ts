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
// So a recorded PTIN carries the calendar year it was verified for, and it
// qualifies while that year is the current calendar year (UTC) or later.
//
// Next year's PTIN. The same IRS page: "PTIN renewal open season begins
// mid-October each year for the following year." From December 1 (New York
// time) an admin may record a renewed PTIN for next year, so a December
// renewal doesn't lock anyone out on January 1, while a record for the
// current year still lapses after December 31. A new PTIN applied for
// late in the year covers one year, not two: "If you are applying for a new
// PTIN after October 1, you must indicate whether you want your PTIN to be
// valid for the current calendar year or the next calendar year. ... If you
// select the next calendar year, your PTIN will not be valid until January 1
// of the next calendar year." (Instructions for Form W-12, Rev. Oct. 2026,
// line 2.) So next year's PTIN is recorded early only as a renewal of a PTIN
// that is also active this year; the admin confirms that.
//   https://www.irs.gov/pub/irs-pdf/iw12.pdf

/** The Tax Prep category's slug (see seed.ts). */
export const TAX_PREP_SLUG = "tax-prep";

/**
 * The IRS Notices & Representation category's slug (see seed.ts): help with
 * an IRS notice or letter, and representation before the IRS. Circular 230,
 * 31 CFR 10.3(a)-(c): attorneys, CPAs and enrolled agents may practice
 * before the IRS; 10.3(d)-(f) limit the practice of everyone else it lists.
 *   https://www.ecfr.gov/current/title-31/section-10.3
 * The IRS: "Enrolled agents, certified public accountants, and attorneys
 * have unlimited representation rights before the IRS."
 *   https://www.irs.gov/tax-professionals/understanding-tax-return-preparer-credentials-and-qualifications
 * So it needs a recorded credential, and no PTIN: "Attorneys and certified
 * public accountants do not need to obtain a PTIN unless they prepare for
 * compensation all or substantially all of a federal tax return or claim
 * for refund", and Form 2848 is among the forms that don't need one
 *   https://www.irs.gov/tax-professionals/frequently-asked-questions-do-i-need-a-ptin
 * while "All enrolled agents must have an active Preparer Tax Identification
 * Number (PTIN)" as a condition of enrollment (Form 8554, Nov. 2022)
 *   https://www.irs.gov/pub/irs-pdf/f8554.pdf
 * Preparing a return for pay belongs in Tax Prep, where the PTIN is required.
 */
export const IRS_HELP_SLUG = "irs-help";

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

/**
 * Whether a PTIN is recorded for the current calendar year (UTC) or later:
 * a renewal recorded in December for next year counts now as well.
 */
export function hasCurrentPtin(
  u: Pick<PreparerState, "has_ptin" | "ptin_year"> | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!u && u.has_ptin && u.ptin_year != null && Number(u.ptin_year) >= utcYear(now);
}

/** The year and month (1-12) in New York at this moment. */
export function newYorkYearMonth(now: Date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month") };
}

/** The month (in New York) from which next year's PTIN may be recorded. */
export const NEXT_YEAR_PTIN_FROM_MONTH = 12;

/**
 * The years an admin may record a PTIN for: the current calendar year (UTC)
 * and, from December 1 in New York, next year as well.
 */
export function recordablePtinYears(now: Date = new Date()): number[] {
  const years = [utcYear(now)];
  const ny = newYorkYearMonth(now);
  if (ny.month >= NEXT_YEAR_PTIN_FROM_MONTH && ny.year + 1 > years[0]) years.push(ny.year + 1);
  return years;
}

/** What a category asks of the person who applies, asks, or is booked. */
export type TaxRequirement = "ptin" | "credential";

/** The requirement for a category, or null if it has none. */
export function taxRequirement(categorySlug: string | null | undefined): TaxRequirement | null {
  if (categorySlug === TAX_PREP_SLUG) return "ptin";
  if (categorySlug === IRS_HELP_SLUG) return "credential";
  return null;
}

/**
 * Whether the user meets the requirement: an active account with a current
 * PTIN for Tax Prep, or with a recorded credential for IRS Notices &
 * Representation.
 */
export function meetsTaxRequirement(
  requirement: TaxRequirement | null,
  u: PreparerState | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!requirement) return true;
  if (!u || u.status !== "active") return false;
  return requirement === "ptin" ? hasCurrentPtin(u, now) : isTaxCredential(u.tax_credential);
}

export const PTIN_REQUIRED =
  "Only preparers whose current PTIN Gideon Tasks has recorded can apply to, ask about, or be booked for Tax Prep tasks. See /tax-prep";

export const CREDENTIAL_REQUIRED =
  "Only enrolled agents, CPAs and attorneys whose credential Gideon Tasks has recorded can apply to, ask about, or be booked for IRS Notices & Representation tasks. See /tax-prep";

/** The 403 message when the requirement isn't met. */
export function taxRequirementMessage(requirement: TaxRequirement): string {
  switch (requirement) {
    case "ptin":
      return PTIN_REQUIRED;
    case "credential":
      return CREDENTIAL_REQUIRED;
  }
}

/**
 * What everyone may see about a user as a preparer: their credential and the
 * year their PTIN is on file for, while it is current. Never the PTIN.
 * Nothing for an account that isn't active.
 */
export interface PreparerBadges {
  tax_credential: TaxCredential | null;
  /** The year the PTIN is recorded for, while current; otherwise null. */
  ptin_year: number | null;
}

export function publicPreparerBadges(
  u: PreparerState | null | undefined,
  now: Date = new Date(),
): PreparerBadges {
  if (!u || u.status !== "active") return { tax_credential: null, ptin_year: null };
  return {
    tax_credential: isTaxCredential(u.tax_credential) ? u.tax_credential : null,
    ptin_year: hasCurrentPtin(u, now) ? Number(u.ptin_year) : null,
  };
}

/** The badge texts, e.g. ["Enrolled Agent", "PTIN on file for 2026"]. */
export function preparerBadgeLabels(b: PreparerBadges): string[] {
  const out: string[] = [];
  if (b.tax_credential) out.push(TAX_CREDENTIAL_LABELS[b.tax_credential]);
  if (b.ptin_year != null) out.push(`PTIN on file for ${b.ptin_year}`);
  return out;
}
