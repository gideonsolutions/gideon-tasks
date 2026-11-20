"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { getStripe } from "@/lib/stripe";
import * as paymentsApi from "@/lib/api/payments";
import type { ApiError, SavedCard } from "@/lib/types";

interface SaveCardFormProps {
  /** Button label before the form opens, e.g. "Add a card" or "Replace card". */
  startLabel: string;
  onSaved: (card: SavedCard) => void;
}

const stripeConfigured = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

/**
 * Saves a card for bookings: a SetupIntent from our server, Stripe's Payment
 * Element for the card details (they go straight to Stripe), and
 * stripe.confirmSetup, which runs any 3-D Secure check in place.
 */
export function SaveCardForm({ startLabel, onSaved }: SaveCardFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!stripeConfigured) {
    return <p className="text-sm text-red-700">Card payments are not available right now.</p>;
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await paymentsApi.createCardSetupIntent();
      setClientSecret(res.client_secret);
    } catch (err) {
      setError((err as ApiError).error ?? "We could not start saving your card.");
    } finally {
      setStarting(false);
    }
  }

  if (!clientSecret) {
    return (
      <div className="space-y-2">
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button onClick={start} loading={starting}>
          {startLabel}
        </Button>
      </div>
    );
  }

  return (
    <Elements stripe={getStripe()} options={{ clientSecret }}>
      <CardForm
        onSaved={(card) => {
          setClientSecret(null);
          onSaved(card);
        }}
        onCancel={() => setClientSecret(null)}
      />
    </Elements>
  );
}

function CardForm({
  onSaved,
  onCancel,
}: {
  onSaved: (card: SavedCard) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSaving(true);
    setError(null);
    try {
      // Cards confirm in place (3-D Secure opens in a modal). The return_url
      // is only used if a payment method needs a full-page redirect; the
      // payment card page finishes the save from its query string.
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: `${window.location.origin}/profile/payment` },
        redirect: "if_required",
      });
      if (stripeError) {
        setError(stripeError.message ?? "Your card could not be saved.");
        return;
      }
      if (setupIntent?.status === "processing") {
        setError("Your card is still being checked. Refresh this page in a minute.");
        return;
      }
      if (setupIntent?.status !== "succeeded") {
        setError("Your card could not be saved. Try again or use a different card.");
        return;
      }
      const res = await paymentsApi.saveCard(setupIntent.id);
      onSaved(res.card);
    } catch (err) {
      setError((err as ApiError).error ?? "Your card could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={saving} disabled={!stripe || !elements}>
          Save card
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
