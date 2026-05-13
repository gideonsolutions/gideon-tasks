"use client";

import { useSyncExternalStore } from "react";
import { useAuthStore } from "@/lib/store/auth";

export function useAuthHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useAuthStore.persist.onFinishHydration(cb),
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}
