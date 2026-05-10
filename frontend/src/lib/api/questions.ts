import { apiClient } from "./client";
import type { TaskQuestion } from "@/lib/types";

export function listQuestions(taskId: string): Promise<TaskQuestion[]> {
  return apiClient.get(`/tasks/${taskId}/questions`);
}

export function askQuestion(
  taskId: string,
  question_body: string,
): Promise<{ id: string }> {
  return apiClient.post(`/tasks/${taskId}/questions`, { question_body });
}

export function answerQuestion(
  taskId: string,
  questionId: string,
  answer_body: string,
): Promise<void> {
  return apiClient.post(
    `/tasks/${taskId}/questions/${questionId}/answer`,
    { answer_body },
  );
}
