import "server-only";
import { execute, queryOne } from "./db";
import { logAudit } from "./audit";
import { IRS_HELP_SLUG, TAX_PREP_SLUG, utcYear } from "./tax-preparers";

/**
 * Marks a task assigned once its escrow hold is authorized. Shared by the
 * assign route and the Stripe webhook (payment_intent.amount_capturable_updated,
 * for a requester who closed the tab after 3-D Secure), so it is safe to call
 * twice: only the call that moves the task out of `published` writes the
 * application updates and the audit entry, which are the same as before.
 *
 * A task for a child (for_minor) is only assigned to a doer whose
 * background check is recorded; the assign route checks this first, and the
 * condition here also covers the webhook path. In the same way, a Tax Prep
 * task is only assigned to an active doer whose PTIN is recorded for the
 * current calendar year (UTC; src/server/tax-preparers.ts), and an IRS
 * Notices & Representation task only to one with a recorded credential
 * (Enrolled Agent, CPA or attorney).
 *
 * Returns true if this call assigned the task.
 */
export async function finalizeAssignment(a: {
  taskId: string;
  applicationId: string;
  doerId: string;
  actorId: string;
}): Promise<boolean> {
  const updated = await queryOne<{ id: string }>(
    `UPDATE tasks SET status = 'assigned', assigned_doer_id = $1, updated_at = now()
     WHERE id = $2 AND status = 'published'
       AND (NOT for_minor OR EXISTS (
         SELECT 1 FROM users u
         WHERE u.id = $1 AND u.status = 'active'
           AND u.background_check_cleared_at IS NOT NULL))
       AND (NOT EXISTS (
         SELECT 1 FROM categories c WHERE c.id = tasks.category_id AND c.slug = $4)
         OR EXISTS (
         SELECT 1 FROM users u
         WHERE u.id = $1 AND u.status = 'active'
           AND u.ptin IS NOT NULL AND u.ptin_year = $3))
       AND (NOT EXISTS (
         SELECT 1 FROM categories c WHERE c.id = tasks.category_id AND c.slug = $5)
         OR EXISTS (
         SELECT 1 FROM users u
         WHERE u.id = $1 AND u.status = 'active'
           AND u.tax_credential IS NOT NULL))
     RETURNING id`,
    [a.doerId, a.taskId, utcYear(), TAX_PREP_SLUG, IRS_HELP_SLUG],
  );
  if (!updated) return false;

  await execute(
    `UPDATE task_applications SET status = 'accepted' WHERE id = $1`,
    [a.applicationId],
  );
  await execute(
    `UPDATE task_applications SET status = 'rejected'
     WHERE task_id = $1 AND id != $2 AND status = 'pending'`,
    [a.taskId, a.applicationId],
  );

  await logAudit(
    a.actorId,
    "task.assigned",
    "task",
    a.taskId,
    { status: "published" },
    { status: "assigned", doer_id: a.doerId },
  );
  return true;
}
