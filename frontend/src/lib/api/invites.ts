import { apiClient } from "./client";
import type { Invite, CreateInviteRequest } from "@/lib/types";

export function listInvites(): Promise<Invite[]> {
  return apiClient.get("/invites");
}

export function createInvites(data: CreateInviteRequest): Promise<Invite[]> {
  return apiClient.post("/invites", data);
}

export function validateInvite(code: string): Promise<Invite> {
  return apiClient.get(`/invites/${code}`);
}
