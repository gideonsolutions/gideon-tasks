import { apiClient } from "./client";
import type { Review, CreateReviewRequest } from "@/lib/types";

export function createReview(
  taskId: string,
  data: CreateReviewRequest,
): Promise<Review> {
  return apiClient.post(`/tasks/${taskId}/reviews`, data);
}

export function listUserReviews(userId: string): Promise<Review[]> {
  return apiClient.get(`/users/${userId}/reviews`);
}
