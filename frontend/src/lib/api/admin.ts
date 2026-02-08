import { apiClient } from "./client";
import type { AuditLogEntry, ModerationLogEntry } from "@/lib/types";

export function getModerationQueue(): Promise<ModerationLogEntry[]> {
  return apiClient.get("/admin/moderation");
}

export function approveModeration(id: string): Promise<void> {
  return apiClient.post(`/admin/moderation/${id}/approve`);
}

export function rejectModeration(id: string): Promise<void> {
  return apiClient.post(`/admin/moderation/${id}/reject`);
}

export function listDisputes(): Promise<unknown[]> {
  return apiClient.get("/admin/disputes");
}

export function resolveDispute(
  id: string,
  data: { resolution: string },
): Promise<void> {
  return apiClient.post(`/admin/disputes/${id}/resolve`, data);
}

export function queryAuditLog(
  params?: Record<string, string>,
): Promise<AuditLogEntry[]> {
  const query = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiClient.get(`/admin/audit-log${query}`);
}

export function suspendUser(id: string): Promise<void> {
  return apiClient.post(`/admin/users/${id}/suspend`);
}

export function banUser(id: string): Promise<void> {
  return apiClient.post(`/admin/users/${id}/ban`);
}
