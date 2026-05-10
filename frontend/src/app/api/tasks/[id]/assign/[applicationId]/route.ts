import {
  handle,
  notFound,
  forbidden,
  paymentError,
} from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { transitionTo, type TaskStatus } from "@/server/state-machine";
import { createEscrowPayment } from "@/server/payments";
import { logAudit } from "@/server/audit";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

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
    }>(
      `SELECT requester_id, status, price_cents, pricing_mode FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.requester_id !== auth.userId) throw forbidden("Not your task");
    transitionTo(task.status, "assigned");

    const app = await queryOne<{ id: string; doer_id: string }>(
      `SELECT id, doer_id FROM task_applications
       WHERE id = $1 AND task_id = $2 AND status = 'pending'`,
      [applicationId, id],
    );
    if (!app) throw notFound("Application not found");

    const requester = await queryOne<{ stripe_customer_id: string | null }>(
      `SELECT stripe_customer_id FROM users WHERE id = $1`,
      [auth.userId],
    );
    if (!requester?.stripe_customer_id) {
      throw paymentError("Requester has no payment method on file");
    }

    const { clientSecret } = await createEscrowPayment(
      id,
      auth.userId,
      app.doer_id,
      task.price_cents,
      task.pricing_mode,
      requester.stripe_customer_id,
    );

    await execute(
      `UPDATE tasks SET status = 'assigned', assigned_doer_id = $1, updated_at = now() WHERE id = $2`,
      [app.doer_id, id],
    );
    await execute(
      `UPDATE task_applications SET status = 'accepted' WHERE id = $1`,
      [applicationId],
    );
    await execute(
      `UPDATE task_applications SET status = 'rejected'
       WHERE task_id = $1 AND id != $2 AND status = 'pending'`,
      [id, applicationId],
    );

    await logAudit(
      auth.userId,
      "task.assigned",
      "task",
      id,
      { status: "published" },
      { status: "assigned", doer_id: app.doer_id },
    );

    return ok({
      message: "Task assigned",
      payment_client_secret: clientSecret,
    });
  });
}
