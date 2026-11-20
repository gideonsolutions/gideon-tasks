import { apiClient } from "./client";
import type { SavedCard } from "@/lib/types";

/** The card used for bookings, or null if none is saved. */
export function getPaymentMethod(): Promise<{ card: SavedCard | null }> {
  return apiClient.get("/users/me/payment-method");
}

/** Starts saving a card; returns the SetupIntent client secret for Elements. */
export function createCardSetupIntent(): Promise<{ client_secret: string }> {
  return apiClient.post("/users/me/payment-method/setup-intent");
}

/** Records the card from a succeeded SetupIntent as the one for bookings. */
export function saveCard(setupIntentId: string): Promise<{ card: SavedCard; message: string }> {
  return apiClient.post("/users/me/payment-method", { setup_intent_id: setupIntentId });
}
