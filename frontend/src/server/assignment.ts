import "server-only";
import { execute, queryOne } from "./db";
import { logAudit } from "./audit";

/**
 * Marks a task assigned once its escrow hold is authorized. Shared by the
 * assign route and the Stripe webhook (payment_intent.amount_capturable_updated,
 * for a requester who closed the tab after 3-D Secure), so it is safe to call
 * twice: only the call that moves the task out of `published` writes the
 * application updates and the audit entry, which are the same as before.
 *
 * A task for a child (for_minor) is only assigned to a doer whose
 * background check is recorded; the assign route checks this first, and the
 * condition here also covers the webhook path.
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
     RETURNING id`,
    [a.doerId, a.taskId],
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
