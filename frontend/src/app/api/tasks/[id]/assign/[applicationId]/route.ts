import { handle, notFound, forbidden, conflict } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { transitionTo, type TaskStatus } from "@/server/state-machine";
import { authorizeEscrowPayment } from "@/server/payments";
import { finalizeAssignment } from "@/server/assignment";
import { ok } from "@/server/route-helpers";
import { requireBackgroundCheck } from "@/server/minor-safeguards";

export const runtime = "nodejs";

/**
 * Assigns a doer. The requester's saved card is authorized for the full
 * amount (manual capture) first, and the task is only assigned once that
 * hold succeeds. Responses:
 *  - `{ status: "assigned" }`: done.
 *  - `{ status: "requires_action", payment_client_secret }`: the bank wants
 *    3-D Secure. The browser runs stripe.handleNextAction with the secret and
 *    then calls this endpoint again, which finds the authorized hold and
 *    assigns the task.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; applicationId: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id, applicationId } = await params;

    const task = await queryOne<{
      requester_id: string;
      status: TaskStatus;
      price_cents: number;
      pricing_mode: "doer_receives" | "requester_pays";
      assigned_doer_id: string | null;
      for_minor: boolean;
    }>(
      `SELECT requester_id, status, price_cents, pricing_mode, assigned_doer_id, for_minor
       FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.requester_id !== auth.userId) throw forbidden("Not your task");

    const app = await queryOne<{ id: string; doer_id: string; status: string }>(
      `SELECT id, doer_id, status FROM task_applications WHERE id = $1 AND task_id = $2`,
      [applicationId, id],
    );
    if (!app) throw notFound("Application not found");

    const assignedResponse = () => ok({ status: "assigned", message: "Task assigned" });

    // A repeat after the assignment already went through (the browser
    // retrying after 3-D Secure, or the webhook finishing first).
    if (
      task.status === "assigned" &&
      task.assigned_doer_id === app.doer_id &&
      app.status === "accepted"
    ) {
      return assignedResponse();
    }

    transitionTo(task.status, "assigned");
    if (app.status !== "pending") throw notFound("Application not found");
    // Checked again here, before the card is authorized: the tutor's check
    // may have been cleared since they applied.
    if (task.for_minor) await requireBackgroundCheck(app.doer_id);

    const result = await authorizeEscrowPayment({
      taskId: id,
      applicationId,
      requesterId: auth.userId,
      doerId: app.doer_id,
      anchorCents: Number(task.price_cents),
      pricingMode: task.pricing_mode,
    });

    if (result.status === "requires_action") {
      return ok({
        status: "requires_action",
        message: "Your bank needs you to confirm this payment.",
        payment_client_secret: result.clientSecret,
        payment_intent_id: result.paymentIntentId,
      });
    }

    const assigned = await finalizeAssignment({
      taskId: id,
      applicationId,
      doerId: app.doer_id,
      actorId: auth.userId,
    });
    if (!assigned) {
      const current = await queryOne<{ status: string; assigned_doer_id: string | null }>(
        `SELECT status, assigned_doer_id FROM tasks WHERE id = $1`,
        [id],
      );
      if (current?.status !== "assigned" || current.assigned_doer_id !== app.doer_id) {
        throw conflict("This task changed while you were booking. Refresh the page.");
      }
    }

    return assignedResponse();
  });
}
