"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, JwtClaims, RegisterResponse, LoginSession } from "@/lib/types";
import * as authApi from "@/lib/api/auth";
import * as usersApi from "@/lib/api/users";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;

  // Derived from JWT
  isAdmin: boolean;
  trustLevel: number;

  // Actions
  /**
   * The password step. With two-step sign-in on, it returns the pending
   * token for completeTwoStep and signs nobody in yet.
   */
  login: (email: string, password: string) => Promise<{ pendingToken: string } | null>;
  /** The code step: a code from the app, or a recovery code. */
  completeTwoStep: (pendingToken: string, code: string) => Promise<LoginSession>;
  register: (data: Parameters<typeof authApi.register>[0]) => Promise<RegisterResponse>;
  logout: () => void;
  refresh: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAdmin: false,
      trustLevel: 0,

      setTokens: (accessToken: string, refreshToken: string) => {
        const claims = decodeJwt(accessToken);
        set({
          accessToken,
          refreshToken,
          isAdmin: claims?.is_admin ?? false,
          trustLevel: claims?.trust_level ?? 0,
        });
      },

      login: async (email: string, password: string) => {
        const res = await authApi.login({ email, password });
        if ("two_step_required" in res) return { pendingToken: res.pending_token };
        const claims = decodeJwt(res.access_token);
        set({
          accessToken: res.access_token,
          refreshToken: res.refresh_token,
          user: res.user,
          isAdmin: claims?.is_admin ?? false,
          trustLevel: claims?.trust_level ?? 0,
        });
        return null;
      },

      completeTwoStep: async (pendingToken: string, code: string) => {
        const res = await authApi.loginTwoStep({ pending_token: pendingToken, code });
        const claims = decodeJwt(res.access_token);
        set({
          accessToken: res.access_token,
          refreshToken: res.refresh_token,
          user: res.user,
          isAdmin: claims?.is_admin ?? false,
          trustLevel: claims?.trust_level ?? 0,
        });
        return res;
      },

      register: (data) => authApi.register(data),

      logout: () => {
        const { accessToken } = get();
        if (accessToken) {
          authApi.logout().catch(() => {
            // Best-effort server-side logout
          });
        }
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAdmin: false,
          trustLevel: 0,
        });
      },

      refresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;
        try {
          const res = await authApi.refresh({ refresh_token: refreshToken });
          const claims = decodeJwt(res.access_token);
          set({
            accessToken: res.access_token,
            refreshToken: res.refresh_token,
            isAdmin: claims?.is_admin ?? false,
            trustLevel: claims?.trust_level ?? 0,
          });
        } catch {
          // Refresh failed — force logout
          get().logout();
        }
      },

      fetchUser: async () => {
        try {
          const user = await usersApi.getMe();
          set({ user });
        } catch {
          // If fetching user fails, leave existing state
        }
      },
    }),
    {
      name: "gideon-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAdmin: state.isAdmin,
        trustLevel: state.trustLevel,
      }),
    },
  ),
);
