import "server-only";
import { queryOne } from "./db";
import { forbidden } from "./errors";
import { TUTORING_SLUG } from "./moderation";

// Tutoring for a child under 18 (tasks.for_minor). The policy is on
// /safeguarding; these are the parts the API enforces.

export interface MinorTaskFields {
  forMinor: boolean;
  categorySlug: string | null | undefined;
  locationType: "remote" | "in_person";
  /** The poster confirmed an in-person address is a public place. */
  publicPlaceConfirmed?: boolean;
}

/** Why a task can't be saved as tutoring for a child, or null if it can. */
export function minorTaskProblem(t: MinorTaskFields): string | null {
  if (!t.forMinor) return null;
  if (t.categorySlug !== TUTORING_SLUG) {
    return "Only a Tutoring task can be for a child under 18";
  }
  if (t.locationType === "in_person" && t.publicPlaceConfirmed !== true) {
    return "In-person tutoring for a child must be at a public place, such as a library. Confirm that the address is a public place, or choose Remote";
  }
  return null;
}

export interface BackgroundCheckState {
  status: string;
  background_check_cleared_at: string | Date | null;
}

/**
 * Whether a user may apply to, ask a question on, or be assigned a task for
 * a child: an active account whose background check an admin has recorded.
 */
export function mayTutorMinors(u: BackgroundCheckState | null | undefined): boolean {
  return !!u && u.status === "active" && u.background_check_cleared_at != null;
}

export const BACKGROUND_CHECK_REQUIRED =
  "Only tutors whose background check Gideon Tasks has recorded can apply to, ask about, or be booked for tutoring for a child. See /safeguarding";

/** Throws 403 unless the user may tutor minors (see mayTutorMinors). */
export async function requireBackgroundCheck(userId: string): Promise<void> {
  const u = await queryOne<BackgroundCheckState>(
    `SELECT status, background_check_cleared_at FROM users WHERE id = $1`,
    [userId],
  );
  if (!mayTutorMinors(u)) throw forbidden(BACKGROUND_CHECK_REQUIRED);
}

/** The category slug for a category id, or null if there is no such category. */
export async function categorySlug(categoryId: string): Promise<string | null> {
  const row = await queryOne<{ slug: string }>(
    `SELECT slug FROM categories WHERE id = $1`,
    [categoryId],
  );
  return row?.slug ?? null;
}
