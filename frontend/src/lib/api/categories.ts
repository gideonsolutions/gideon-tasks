import { apiClient } from "./client";
import type { Category } from "@/lib/types";

export function listCategories(): Promise<Category[]> {
  return apiClient.get("/categories");
}

export interface CurrentFee {
  fee_bps: number;
  platform_volume_cents: number;
}

export function getCurrentFee(): Promise<CurrentFee> {
  return apiClient.get("/fees/current");
}
