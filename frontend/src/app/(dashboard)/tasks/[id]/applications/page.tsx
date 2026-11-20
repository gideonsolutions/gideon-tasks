"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatCents, formatRelative } from "@/lib/utils/format";
import { calculateFees } from "@/lib/utils/fees";
import { GIDEON_FEE_BPS } from "@/lib/constants";
import { formatCardBrand, getStripe } from "@/lib/stripe";
import * as applicationsApi from "@/lib/api/applications";
import * as categoriesApi from "@/lib/api/categories";
import * as paymentsApi from "@/lib/api/payments";
import * as tasksApi from "@/lib/api/tasks";
import type { ApiError } from "@/lib/types";

const AUTH_FAILED =
  "Your bank could not confirm this payment. Try again, or add a different card under Payment Card.";

/**
 * Places the hold and assigns the doer. If the bank asks for 3-D Secure,
 * Stripe.js shows the check, and the assign call is repeated so the server
 * can see the authorized hold and assign the task.
 */
async function assignWithCard(taskId: string, applicationId: string): Promise<void> {
  const first = await tasksApi.assignTask(taskId, applicationId);
  if (first.status === "assigned") return;

  const stripe = await getStripe();
  if (!stripe) throw { error: "Card payments are not available right now." } as ApiError;
  const result = await stripe.handleNextAction({ clientSecret: first.payment_client_secret });
  if (result.error) {
    throw { error: result.error.message ?? AUTH_FAILED } as ApiError;
  }
  if (result.paymentIntent?.status !== "requires_capture") {
    throw { error: AUTH_FAILED } as ApiError;
  }

  const second = await tasksApi.assignTask(taskId, applicationId);
  if (second.status !== "assigned") throw { error: AUTH_FAILED } as ApiError;
}

export default function TaskApplicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const { addToast } = useToast();
  const [assigning, setAssigning] = useState<string | null>(null);

  const { data: task, refetch: refetchTask } = useApi(() => tasksApi.getTask(id), [id]);
  const { data: applications, loading, refetch } = useApi(
    () => applicationsApi.listApplications(id),
    [id],
  );
  const isRequester = !!task && task.requester_id === user?.id;
  const { data: payment, loading: cardLoading } = useApi(
    () =>
      isRequester
        ? paymentsApi.getPaymentMethod()
        : Promise.resolve({ card: null }),
    [isRequester],
  );
  const { data: fee } = useApi(() => categoriesApi.getCurrentFee(), []);

  const card = payment?.card ?? null;
  const canAssign = isRequester && task?.status === "published";
  const holdCents = task
    ? calculateFees(task.price_cents, task.pricing_mode, fee?.fee_bps ?? GIDEON_FEE_BPS)
        .total_charged_cents
    : 0;

  async function handleAssign(applicationId: string) {
    setAssigning(applicationId);
    try {
      await assignWithCard(id, applicationId);
      addToast("Doer assigned. Your card is charged when they start work.", "success");
      refetch();
      refetchTask();
    } catch (err) {
      addToast((err as ApiError).error ?? "Failed to assign", "error");
      refetch();
      refetchTask();
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Applications</h1>

      {canAssign && !cardLoading && (
        <div
          role="status"
          className={
            card
              ? "rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700"
              : "rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          }
        >
          {card ? (
            <p>
              Assigning a doer places a hold of about{" "}
              <strong>{formatCents(holdCents)}</strong> on your{" "}
              {formatCardBrand(card.brand)} ending in {card.last4}. You are
              charged when the doer starts work.{" "}
              <Link href="/profile/payment" className="text-blue-600 hover:underline">
                Change card
              </Link>
            </p>
          ) : (
            <p>
              Add a payment card before you assign a doer.{" "}
              <Link href="/profile/payment" className="font-medium text-blue-700 hover:underline">
                Add a card
              </Link>
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !applications?.length ? (
        <Card>
          <CardContent>
            <p className="text-gray-500 text-center py-4">No applications yet.</p>
          </CardContent>
        </Card>
      ) : (
        applications.map((app) => (
          <Card key={app.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Applicant: {app.doer_id.slice(0, 8)}...
                </CardTitle>
                <span className="text-xs text-gray-500">
                  {formatRelative(app.created_at)}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {app.message && (
                <p className="text-sm text-gray-700 mb-3">{app.message}</p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Status: {app.status}</span>
                {canAssign && app.status === "pending" && (
                  <Button
                    size="sm"
                    loading={assigning === app.id}
                    disabled={!card || (assigning !== null && assigning !== app.id)}
                    onClick={() => handleAssign(app.id)}
                  >
                    Assign
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
