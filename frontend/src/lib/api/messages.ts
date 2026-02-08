import { apiClient } from "./client";
import type { TaskMessage, CreateMessageRequest } from "@/lib/types";

export function listMessages(taskId: string): Promise<TaskMessage[]> {
  return apiClient.get(`/tasks/${taskId}/messages`);
}

export function sendMessage(
  taskId: string,
  data: CreateMessageRequest,
): Promise<TaskMessage> {
  return apiClient.post(`/tasks/${taskId}/messages`, data);
}
