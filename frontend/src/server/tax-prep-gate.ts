import "server-only";
import { queryOne } from "./db";
import { forbidden } from "./errors";
import {
  meetsTaxRequirement,
  preparerColumns,
  taxRequirement,
  taxRequirementMessage,
  type PreparerState,
} from "./tax-preparers";

/**
 * Throws 403 unless the user may apply to, ask about, or be booked for a task
 * in this category: for Tax Prep, an active account with a PTIN recorded for
 * the current calendar year (src/server/tax-preparers.ts). Categories without
 * a requirement pass without a query.
 */
export async function requireTaxQualification(
  userId: string,
  categorySlug: string | null | undefined,
): Promise<void> {
  const requirement = taxRequirement(categorySlug);
  if (!requirement) return;
  const u = await queryOne<PreparerState>(
    `SELECT ${preparerColumns()} FROM users WHERE id = $1`,
    [userId],
  );
  if (!meetsTaxRequirement(requirement, u)) {
    throw forbidden(taxRequirementMessage(requirement));
  }
}
