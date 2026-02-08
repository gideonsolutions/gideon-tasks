"use client";

import { useAuthStore } from "@/lib/store/auth";

export function useAuth() {
  const {
    user,
    accessToken,
    isAdmin,
    trustLevel,
    login,
    logout,
    register,
    fetchUser,
  } = useAuthStore();

  return {
    user,
    isAuthenticated: !!accessToken,
    isAdmin,
    trustLevel,
    login,
    logout,
    register,
    fetchUser,
  };
}
