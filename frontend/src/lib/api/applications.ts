import { apiClient } from "./client";
import type { TaskApplication, CreateApplicationRequest } from "@/lib/types";

export function listApplications(taskId: string): Promise<TaskApplication[]> {
  return apiClient.get(`/tasks/${taskId}/applications`);
}

export function createApplication(
  taskId: string,
  data: CreateApplicationRequest,
): Promise<TaskApplication> {
  return apiClient.post(`/tasks/${taskId}/applications`, data);
}

export function withdrawApplication(taskId: string): Promise<void> {
  return apiClient.delete(`/tasks/${taskId}/applications/mine`);
}
