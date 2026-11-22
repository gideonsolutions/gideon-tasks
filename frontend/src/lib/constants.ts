// Hard-coded constants matching backend

import {
  MAX_TASK_VALUE_CENTS,
  MAX_CONCURRENT_DOER,
  MAX_ACTIVE_POSTED,
} from "@/server/trust-levels";

/** Default Gideon fee — used for client-side previews before /fees/current loads. */
export const GIDEON_FEE_BPS = 500;
export const STRIPE_RATE_BPS = 290; // 2.9%
export const STRIPE_FIXED_CENTS = 30; // $0.30
export const MIN_TASK_PRICE_CENTS = 500; // $5.00

/** Published fee staircase, mirrored from backend `src/server/fees.ts`. */
export interface FeeTier {
  volumeFromCents: number;
  volumeToCents: number | null;
  bps: number;
}

export const FEE_SCHEDULE: FeeTier[] = [
  { volumeFromCents: 0, volumeToCents: 100_000_000, bps: 500 },
  { volumeFromCents: 100_000_000, volumeToCents: 200_000_000, bps: 450 },
  { volumeFromCents: 200_000_000, volumeToCents: 500_000_000, bps: 400 },
  { volumeFromCents: 500_000_000, volumeToCents: 1_000_000_000, bps: 350 },
  { volumeFromCents: 1_000_000_000, volumeToCents: 2_000_000_000, bps: 300 },
  { volumeFromCents: 2_000_000_000, volumeToCents: 5_000_000_000, bps: 250 },
  { volumeFromCents: 5_000_000_000, volumeToCents: 10_000_000_000, bps: 200 },
  { volumeFromCents: 10_000_000_000, volumeToCents: 20_000_000_000, bps: 150 },
  { volumeFromCents: 20_000_000_000, volumeToCents: null, bps: 100 },
];

export function feeBpsForVolume(volumeCents: number): number {
  for (const tier of FEE_SCHEDULE) {
    if (
      volumeCents >= tier.volumeFromCents &&
      (tier.volumeToCents === null || volumeCents < tier.volumeToCents)
    ) {
      return tier.bps;
    }
  }
  return 100;
}

// Trust level limits: one definition in src/server/trust-levels.ts (a pure
// module), re-exported here so the UI and the API cannot drift apart.
export const TRUST_LEVELS = {
  MAX_TASK_VALUE_CENTS,
  MAX_CONCURRENT_DOER,
  MAX_ACTIVE_POSTED,
};

export {
  canPostTasks,
  canApplyForTasks,
  maxTaskValueCents,
  maxConcurrentDoer,
  maxActivePosted,
  LEVEL_1_REQUIREMENTS,
  LEVEL_2_REQUIREMENTS,
  LEVEL_3_REQUIREMENTS,
  ATTESTED_LEVEL_1_REQUIREMENTS,
} from "@/server/trust-levels";

export const TRUST_LEVEL_NAMES: Record<number, string> = {
  // Level 0 is any new account; email verification is shown separately.
  0: "New",
  1: "Established",
  2: "Trusted",
  3: "Pillar",
};

export const TASK_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "assigned",
  "in_progress",
  "submitted",
  "completed",
  "disputed",
  "resolved",
  "cancelled",
  "expired",
  "rejected",
] as const;

export const REVIEW_WINDOW_DAYS = 7;

/**
 * Where people write to a person at Gideon Solutions (the company that runs
 * Gideon Tasks). Gideon Tasks has no contact address of its own yet.
 */
export const CONTACT_URL = "https://www.gideonsolutions.us/contact";

/** The Tutoring category's slug; a task for a child must be in it. */
export { TUTORING_SLUG } from "@/server/moderation";

/** The guardian's tick on a Tutoring task (tasks.for_minor). */
export const GUARDIAN_TICK_LABEL =
  "This is for my child under 18; I'm their parent or legal guardian";

/** Tax preparers: the Tax Prep slug, credentials and the PTIN rule. */
export {
  TAX_PREP_SLUG,
  TAX_CREDENTIALS,
  TAX_CREDENTIAL_LABELS,
  taxRequirement,
  meetsTaxRequirement,
  preparerBadgeLabels,
  utcYear,
} from "@/server/tax-preparers";

/** The IRS Directory of Federal Tax Return Preparers with Credentials and Select Qualifications. */
export const IRS_PREPARER_DIRECTORY_URL = "https://irs.treasury.gov/rpo/rpo.jsf";
