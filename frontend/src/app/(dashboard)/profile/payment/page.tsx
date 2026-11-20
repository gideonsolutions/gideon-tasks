"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { SaveCardForm } from "@/components/stripe/save-card-form";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import { formatCardBrand } from "@/lib/stripe";
import * as paymentsApi from "@/lib/api/payments";
import type { ApiError, SavedCard } from "@/lib/types";

export default function PaymentCardPage() {
  const { user, fetchUser } = useAuth();
  const { addToast } = useToast();
  const { data, loading, error } = useApi(() => paymentsApi.getPaymentMethod(), []);
  // Set after a save, so the page shows the new card without refetching.
  const [savedNow, setSavedNow] = useState<SavedCard | null>(null);
  const [returnMessage, setReturnMessage] = useState<string | null>(null);
  const finishedReturn = useRef(false);

  // Back from a redirect-based confirmation: Stripe appends ?setup_intent=…
  // to the return_url. (Cards normally confirm in place without this.)
  useEffect(() => {
    if (finishedReturn.current) return;
    const setupIntentId = new URLSearchParams(window.location.search).get("setup_intent");
    if (!setupIntentId) return;
    finishedReturn.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    paymentsApi
      .saveCard(setupIntentId)
      .then((res) => {
        setSavedNow(res.card);
        setReturnMessage("Card saved.");
        void fetchUser();
      })
      .catch((err: ApiError) => {
        setReturnMessage(err.error ?? "Your card could not be saved.");
      });
  }, [fetchUser]);

  const card = savedNow ?? data?.card ?? null;

  function handleSaved(next: SavedCard) {
    setSavedNow(next);
    addToast("Card saved", "success");
    void fetchUser();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Payment card</h1>

      <EmailVerificationNotice purpose="to add a payment card" />

      <Card>
        <CardHeader>
          <CardTitle>Card for bookings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            When you assign a doer, we place a hold on this card for the task
            total. The card is charged when the doer starts work, and the doer
            is paid when you approve the finished task. If you cancel before
            the doer starts, the hold is released. Your card details are
            stored by Stripe, not by Gideon Tasks.
          </p>

          {returnMessage && (
            <p role="status" className="text-sm text-gray-800">
              {returnMessage}
            </p>
          )}

          {loading && !savedNow ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : error && !savedNow ? (
            <p className="text-sm text-red-700">{error.error}</p>
          ) : card ? (
            <p className="font-medium text-gray-900">
              {formatCardBrand(card.brand)} ending in {card.last4}
              <span className="ml-2 text-sm font-normal text-gray-500">
                expires {card.exp_month}/{card.exp_year}
              </span>
            </p>
          ) : (
            <p className="text-sm text-gray-700">No card saved yet.</p>
          )}

          {user?.email_verified && (
            <SaveCardForm
              startLabel={card ? "Replace card" : "Add a card"}
              onSaved={handleSaved}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
