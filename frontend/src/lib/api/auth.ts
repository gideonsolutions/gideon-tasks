import { apiClient } from "./client";
import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  LoginSession,
  TwoStepLoginRequest,
  RefreshRequest,
  RefreshResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
  ResendVerificationResponse,
  VerifyPhoneRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  MessageResponse,
} from "@/lib/types";

export function register(data: RegisterRequest): Promise<RegisterResponse> {
  return apiClient.post("/auth/register", data);
}

export function login(data: LoginRequest): Promise<LoginResponse> {
  return apiClient.post("/auth/login", data);
}

export function loginTwoStep(data: TwoStepLoginRequest): Promise<LoginSession> {
  return apiClient.post("/auth/login/two-step", data);
}

export function logout(): Promise<void> {
  return apiClient.post("/auth/logout");
}

export function refresh(data: RefreshRequest): Promise<RefreshResponse> {
  return apiClient.post("/auth/refresh", data);
}

export function verifyEmail(data: VerifyEmailRequest): Promise<VerifyEmailResponse> {
  return apiClient.post("/auth/verify-email", data);
}

export function resendVerification(): Promise<ResendVerificationResponse> {
  return apiClient.post("/auth/resend-verification");
}

export function verifyPhone(data: VerifyPhoneRequest): Promise<void> {
  return apiClient.post("/auth/verify-phone", data);
}

/** Always answers the same way, whether or not the address has an account. */
export function forgotPassword(data: ForgotPasswordRequest): Promise<MessageResponse> {
  return apiClient.post("/auth/forgot-password", data);
}

export function resetPassword(data: ResetPasswordRequest): Promise<MessageResponse> {
  return apiClient.post("/auth/reset-password", data);
}
