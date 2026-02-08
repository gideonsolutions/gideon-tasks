"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, JwtClaims } from "@/lib/types";
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
  login: (email: string, password: string) => Promise<void>;
  register: (data: Parameters<typeof authApi.register>[0]) => Promise<string>;
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
        const claims = decodeJwt(res.access_token);
        set({
          accessToken: res.access_token,
          refreshToken: res.refresh_token,
          user: res.user,
          isAdmin: claims?.is_admin ?? false,
          trustLevel: claims?.trust_level ?? 0,
        });
      },

      register: async (data) => {
        const res = await authApi.register(data);
        return res.user_id;
      },

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
