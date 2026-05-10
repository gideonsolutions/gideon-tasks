import "server-only";
import { execute, queryOne } from "./db";
import { newId } from "./auth";
import { calculateFees, feeBpsForVolume } from "./fees";
import { platformVolumeCents } from "./platform-volume";
import { stripe } from "./stripe";
import { paymentError, notFound } from "./errors";

interface PaymentRow {
  id: string;
  task_id: string;
  doer_id: string;
  task_price_cents: number;
  doer_payout_cents: number;
  stripe_payment_intent_id: string;
  stripe_transfer_id: string | null;
  status: string;
}

async function fetchPayment(taskId: string): Promise<PaymentRow> {
  const row = await queryOne<PaymentRow>(
    `SELECT id, task_id, doer_id, task_price_cents, doer_payout_cents,
            stripe_payment_intent_id, stripe_transfer_id, status
     FROM payments WHERE task_id = $1`,
    [taskId],
  );
  if (!row) throw notFound("Payment not found");
  return row;
}

export async function createEscrowPayment(
  taskId: string,
  requesterId: string,
  doerId: string,
  taskPriceCents: number,
  requesterStripeCustomerId: string,
): Promise<{ paymentId: string; clientSecret: string }> {
  const feeBps = feeBpsForVolume(await platformVolumeCents());
  const fees = calculateFees(taskPriceCents, feeBps);
  const s = stripe();

  let intent;
  try {
    intent = await s.paymentIntents.create({
      amount: fees.total_charged_cents,
      currency: "usd",
      capture_method: "manual",
      customer: requesterStripeCustomerId,
      metadata: {
        task_id: taskId,
        requester_id: requesterId,
        doer_id: doerId,
      },
    });
  } catch (e) {
    throw paymentError(`Stripe PaymentIntent creation failed: ${(e as Error).message}`);
  }

  if (!intent.client_secret) {
    throw paymentError("No client_secret on PaymentIntent");
  }

  const paymentId = newId();
  await execute(
    `INSERT INTO payments
       (id, task_id, requester_id, doer_id, task_price_cents, gideon_fee_cents,
        stripe_fee_cents, total_charged_cents, doer_payout_cents,
        stripe_payment_intent_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', now())`,
    [
      paymentId,
      taskId,
      requesterId,
      doerId,
      fees.task_price_cents,
      fees.gideon_fee_cents,
      fees.stripe_fee_cents,
      fees.total_charged_cents,
      fees.doer_payout_cents,
      intent.id,
    ],
  );

  return { paymentId, clientSecret: intent.client_secret };
}

export async function capturePayment(taskId: string): Promise<void> {
  const payment = await fetchPayment(taskId);
  try {
    await stripe().paymentIntents.capture(payment.stripe_payment_intent_id);
  } catch (e) {
    throw paymentError(`Stripe capture failed: ${(e as Error).message}`);
  }
  await execute(
    `UPDATE payments SET status = 'escrowed', escrowed_at = now() WHERE task_id = $1`,
    [taskId],
  );
}

export async function releasePayment(taskId: string): Promise<void> {
  const payment = await fetchPayment(taskId);
  const doerConnect = await queryOne<{ stripe_connect_account_id: string | null }>(
    `SELECT stripe_connect_account_id FROM users WHERE id = $1`,
    [payment.doer_id],
  );
  if (!doerConnect?.stripe_connect_account_id) {
    throw paymentError("Doer has no Stripe Connect account");
  }

  let transfer;
  try {
    transfer = await stripe().transfers.create({
      amount: payment.doer_payout_cents,
      currency: "usd",
      destination: doerConnect.stripe_connect_account_id,
      metadata: { task_id: taskId, payment_id: payment.id },
    });
  } catch (e) {
    throw paymentError(`Stripe transfer failed: ${(e as Error).message}`);
  }

  await execute(
    `UPDATE payments
     SET status = 'released', released_at = now(), stripe_transfer_id = $1
     WHERE task_id = $2`,
    [transfer.id, taskId],
  );
}

export async function refundPayment(taskId: string): Promise<void> {
  const payment = await fetchPayment(taskId);
  const s = stripe();

  if (payment.status === "pending") {
    try {
      await s.paymentIntents.cancel(payment.stripe_payment_intent_id);
    } catch (e) {
      throw paymentError(`Stripe cancel failed: ${(e as Error).message}`);
    }
  } else {
    try {
      await s.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
      });
    } catch (e) {
      throw paymentError(`Stripe refund failed: ${(e as Error).message}`);
    }
  }

  await execute(
    `UPDATE payments SET status = 'refunded', refunded_at = now() WHERE task_id = $1`,
    [taskId],
  );
}
