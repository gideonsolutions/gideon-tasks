import { apiClient } from "./client";
import type { Task, CreateTaskRequest, UpdateTaskRequest } from "@/lib/types";

export function listTasks(params?: Record<string, string>): Promise<Task[]> {
  const query = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiClient.get(`/tasks${query}`);
}

export function getTask(id: string): Promise<Task> {
  return apiClient.get(`/tasks/${id}`);
}

export function createTask(data: CreateTaskRequest): Promise<Task> {
  return apiClient.post("/tasks", data);
}

export function updateTask(id: string, data: UpdateTaskRequest): Promise<Task> {
  return apiClient.patch(`/tasks/${id}`, data);
}

export function publishTask(id: string): Promise<Task> {
  return apiClient.post(`/tasks/${id}/publish`);
}

export function cancelTask(id: string): Promise<Task> {
  return apiClient.post(`/tasks/${id}/cancel`);
}

export function assignTask(
  id: string,
  applicationId: string,
): Promise<{ payment_client_secret: string }> {
  return apiClient.post(`/tasks/${id}/assign/${applicationId}`);
}

export function startTask(id: string): Promise<Task> {
  return apiClient.post(`/tasks/${id}/start`);
}

export function submitTask(id: string): Promise<Task> {
  return apiClient.post(`/tasks/${id}/submit`);
}

export function approveTask(id: string): Promise<Task> {
  return apiClient.post(`/tasks/${id}/approve`);
}

export function disputeTask(id: string): Promise<Task> {
  return apiClient.post(`/tasks/${id}/dispute`);
}
