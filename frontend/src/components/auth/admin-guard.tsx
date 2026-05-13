"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/auth";
import { useAuthHydrated } from "@/lib/hooks/use-auth-hydrated";
import { Spinner } from "@/components/ui/spinner";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const router = useRouter();
  const hydrated = useAuthHydrated();

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.push("/login");
    } else if (!isAdmin) {
      router.push("/dashboard");
    }
  }, [hydrated, accessToken, isAdmin, router]);

  if (!hydrated || !accessToken || !isAdmin) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
