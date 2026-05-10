import { NextResponse } from "next/server";
import { execute } from "@/server/db";
import { stripe } from "@/server/stripe";
import { env } from "@/server/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header" },
      { status: 400 },
    );
  }

  const raw = await req.text();
  let event;
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
        const pi = event.data.object as { id: string };
        await execute(
          `UPDATE payments SET status = 'failed' WHERE stripe_payment_intent_id = $1`,
          [pi.id],
        );
        break;
      }
      case "transfer.created": {
        const tr = event.data.object as { id: string };
        await execute(
          `UPDATE payments SET status = 'released', released_at = now()
           WHERE stripe_transfer_id = $1`,
          [tr.id],
        );
        break;
      }
      case "account.updated":
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
