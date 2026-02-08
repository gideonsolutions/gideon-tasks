import { useAuthStore } from "@/lib/store/auth";
import type { ApiError } from "@/lib/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

class ApiClient {
  private getToken(): string | null {
    return useAuthStore.getState().accessToken;
  }

  private async refreshIfNeeded(): Promise<void> {
    const state = useAuthStore.getState();
    if (!state.accessToken) return;

    // Decode JWT payload to check expiration
    try {
      const payload = JSON.parse(atob(state.accessToken.split(".")[1]));
      const expiresAt = payload.exp * 1000; // Convert to ms
      const now = Date.now();
      if (expiresAt - now < 60_000) {
        // Less than 60s remaining
        await state.refresh();
      }
    } catch {
      // If we can't decode, let the request fail naturally
    }
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    await this.refreshIfNeeded();

    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // Handle 202 Accepted (content flagged)
    if (response.status === 202) {
      const data = await response.json();
      const error: ApiError = { error: data.error, status: 202 };
      throw error;
    }

    if (!response.ok) {
      let message = "An unexpected error occurred";
      try {
        const data = await response.json();
        message = data.error ?? message;
      } catch {
        // Response wasn't JSON
      }

      const error: ApiError = { error: message, status: response.status };

      // Auto-redirect to login on 401
      if (response.status === 401) {
        useAuthStore.getState().logout();
      }

      throw error;
    }

    return response.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient();
