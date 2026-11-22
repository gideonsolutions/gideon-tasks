import { apiClient } from "./client";
import type { TwoStepAdminView, TwoStepSetup, TwoStepStatus } from "@/lib/types";

export function getTwoStepStatus(): Promise<TwoStepStatus> {
  return apiClient.get("/users/me/two-step");
}

export function startTwoStepSetup(): Promise<TwoStepSetup> {
  return apiClient.post("/users/me/two-step/setup");
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
}

export function enableTwoStep(password: string, code: string): Promise<SessionTokens & { recovery_codes: string[] }> {
  return apiClient.post("/users/me/two-step/enable", { password, code });
}

export function disableTwoStep(password: string, code: string): Promise<SessionTokens> {
  return apiClient.post("/users/me/two-step/disable", { password, code });
}

export function replaceRecoveryCodes(password: string, code: string): Promise<{ recovery_codes: string[] }> {
  return apiClient.post("/users/me/two-step/recovery-codes", { password, code });
}

export function getUserTwoStep(userId: string): Promise<TwoStepAdminView> {
  return apiClient.get(`/admin/users/${userId}/two-step`);
}

export function resetUserTwoStep(userId: string, note: string): Promise<TwoStepAdminView> {
  return apiClient.post(`/admin/users/${userId}/two-step`, { note });
}
