import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { execute, queryOne } from "@/server/db";
import { stripe } from "@/server/stripe";
import { env } from "@/server/env";
import { finalizeAssignment } from "@/server/assignment";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | undefined): v is string => !!v && UUID.test(v);

/**
 * Subscribe the endpoint to: payment_intent.succeeded,
 * payment_intent.payment_failed, payment_intent.amount_capturable_updated
 * and transfer.created. Every handler is idempotent, because Stripe can
 * deliver an event more than once.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header" },
      { status: 400 },
    );
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      raw,
      sig,
      env.stripeWebhookSecret,
    );
  } catch (e) {
    return NextResponse.json(
      { error: `Invalid webhook signature: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as { id: string };
        await execute(
          `UPDATE payments SET status = 'escrowed', escrowed_at = now()
           WHERE stripe_payment_intent_id = $1 AND status = 'pending'`,
          [pi.id],
        );
        break;
      }
      case "payment_intent.payment_failed": {
        // Only an attempt that has not been captured can fail.
        const pi = event.data.object as { id: string };
        await execute(
          `UPDATE payments SET status = 'failed'
           WHERE stripe_payment_intent_id = $1 AND status = 'pending'`,
          [pi.id],
        );
        break;
      }
      case "payment_intent.amount_capturable_updated": {
        // The escrow hold is authorized. Normally the browser finishes the
        // assignment right away; this covers a requester who closed the tab
        // after 3-D Secure.
        const pi = event.data.object as {
          id: string;
          status: string;
          metadata?: Record<string, string>;
        };
        const md = pi.metadata ?? {};
        if (
          pi.status !== "requires_capture" ||
          !isUuid(md.task_id) ||
          !isUuid(md.application_id) ||
          !isUuid(md.doer_id) ||
          !isUuid(md.requester_id)
        ) {
          break;
        }
        const match = await queryOne<{ ok: boolean }>(
          `SELECT true AS ok
           FROM payments p
           JOIN tasks t ON t.id = p.task_id
           JOIN task_applications a ON a.task_id = t.id
           WHERE p.stripe_payment_intent_id = $1 AND p.status = 'pending'
             AND p.task_id = $2 AND p.doer_id = $3
             AND t.requester_id = $4 AND t.status = 'published'
             AND a.id = $5 AND a.doer_id = $3 AND a.status = 'pending'`,
          [pi.id, md.task_id, md.doer_id, md.requester_id, md.application_id],
        );
        if (match) {
          await finalizeAssignment({
            taskId: md.task_id,
            applicationId: md.application_id,
            doerId: md.doer_id,
            actorId: md.requester_id,
          });
        }
        break;
      }
      case "transfer.created": {
        const tr = event.data.object as {
          id: string;
          metadata?: Record<string, string>;
        };
        await execute(
          `UPDATE payments SET status = 'released', released_at = now()
           WHERE stripe_transfer_id = $1`,
          [tr.id],
        );
        // If the approve request's database write was lost after the
        // transfer went through, record it from the transfer's metadata.
        const paymentId = tr.metadata?.payment_id;
        if (isUuid(paymentId)) {
          await execute(
            `UPDATE payments
             SET status = 'released', released_at = now(), stripe_transfer_id = $1
             WHERE id = $2 AND stripe_transfer_id IS NULL AND status = 'escrowed'`,
            [tr.id, paymentId],
          );
        }
        break;
      }
      case "account.updated":
        // Payout status is read live from Stripe when needed.
        break;
      default:
        break;
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
