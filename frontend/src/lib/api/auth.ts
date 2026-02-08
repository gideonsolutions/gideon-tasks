import { apiClient } from "./client";
import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
  VerifyEmailRequest,
  VerifyPhoneRequest,
} from "@/lib/types";

export function register(data: RegisterRequest): Promise<RegisterResponse> {
  return apiClient.post("/auth/register", data);
}

export function login(data: LoginRequest): Promise<LoginResponse> {
  return apiClient.post("/auth/login", data);
}

export function logout(): Promise<void> {
  return apiClient.post("/auth/logout");
}

export function refresh(data: RefreshRequest): Promise<RefreshResponse> {
  return apiClient.post("/auth/refresh", data);
}

export function verifyEmail(data: VerifyEmailRequest): Promise<void> {
  return apiClient.post("/auth/verify-email", data);
}

export function verifyPhone(data: VerifyPhoneRequest): Promise<void> {
  return apiClient.post("/auth/verify-phone", data);
}
