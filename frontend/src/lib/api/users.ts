import { apiClient } from "./client";
import type {
  User,
  PublicUserProfile,
  StripeConnectResponse,
  StripeConnectStatus,
  Task,
} from "@/lib/types";

export function getMe(): Promise<User> {
  return apiClient.get("/users/me");
}

export function updateMe(data: Partial<Pick<User, "legal_first_name" | "legal_last_name" | "email" | "phone">>): Promise<User> {
  return apiClient.patch("/users/me", data);
}

export function getUserProfile(id: string): Promise<PublicUserProfile> {
  return apiClient.get(`/users/${id}`);
}

export function initiateStripeConnect(): Promise<StripeConnectResponse> {
  return apiClient.post("/users/me/stripe-connect");
}

export function getStripeConnectStatus(): Promise<StripeConnectStatus> {
  return apiClient.get("/users/me/stripe-connect/status");
}

export function getMyTasks(): Promise<{ posted: Task[]; doing: Task[] }> {
  return apiClient.get("/users/me/tasks");
}
