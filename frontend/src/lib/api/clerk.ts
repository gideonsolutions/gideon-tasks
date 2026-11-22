import { apiClient } from "./client";
import type { ClerkSessionType } from "@/server/clerk-rules";
import type { ClerkAdminBooking, ClerkBooking } from "@/server/clerk";

// Type-only: the definitions live with the code that builds them.
export type { ClerkAdminBooking, ClerkBooking };

export type ClerkBookingResponse =
  | { status: "booked"; booking: ClerkBooking }
  | {
      status: "requires_action";
      booking: ClerkBooking;
      /** Pass to stripe.handleNextAction, then call confirmClerkBooking. */
      payment_client_secret: string;
    };

export interface CreateClerkBookingRequest {
  hours: number;
  session_type: ClerkSessionType;
  time_zone: string;
  description: string;
  safety_acknowledged: boolean;
}

export function listMyClerkBookings(): Promise<ClerkBooking[]> {
  return apiClient.get("/clerk/bookings");
}

export function createClerkBooking(data: CreateClerkBookingRequest): Promise<ClerkBookingResponse> {
  return apiClient.post("/clerk/bookings", data);
}

export function confirmClerkBooking(id: string): Promise<ClerkBookingResponse> {
  return apiClient.post(`/clerk/bookings/${id}/confirm`);
}

export function cancelClerkBooking(id: string): Promise<{ booking: ClerkBooking; message: string }> {
  return apiClient.post(`/clerk/bookings/${id}/cancel`);
}

// ─── Admin ───────────────────────────────────────────────

export function listClerkBookingsAdmin(scope: "open" | "all"): Promise<ClerkAdminBooking[]> {
  return apiClient.get(`/admin/clerk?scope=${scope}`);
}

export function scheduleClerkBooking(
  id: string,
  data: { scheduled_for: string; meeting_details: string },
): Promise<{ booking: ClerkAdminBooking; email_sent: boolean }> {
  return apiClient.post(`/admin/clerk/${id}/schedule`, data);
}

export function completeClerkBooking(
  id: string,
  data: { hours_used: number },
): Promise<{ booking: ClerkAdminBooking }> {
  return apiClient.post(`/admin/clerk/${id}/complete`, data);
}

export function cancelClerkBookingAdmin(
  id: string,
  data: { reason: string },
): Promise<{ booking: ClerkAdminBooking }> {
  return apiClient.post(`/admin/clerk/${id}/cancel`, data);
}
