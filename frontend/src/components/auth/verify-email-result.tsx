"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/lib/store/auth";
import { useAuthHydrated } from "@/lib/hooks/use-auth-hydrated";
import * as authApi from "@/lib/api/auth";
import type { ApiError } from "@/lib/types";

type State =
  | { kind: "verifying" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

const linkClass =
  "inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";

export function VerifyEmailResult({ token }: { token: string }) {
  const [state, setState] = useState<State>(
    token
      ? { kind: "verifying" }
      : {
          kind: "error",
          message:
            "This link is missing its verification code. Open the link from the email again, or sign in and ask for a new one.",
        },
  );
  const started = useRef(false);
  const hydrated = useAuthHydrated();
  const signedIn = useAuthStore((s) => !!s.accessToken);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    authApi
      .verifyEmail({ token })
      .then((res) => {
        setState({ kind: "done", message: res.message });
        const store = useAuthStore.getState();
        if (store.accessToken) void store.fetchUser();
      })
      .catch((err: ApiError) => {
        setState({
          kind: "error",
          message: err.error ?? "We could not confirm your email address.",
        });
      });
  }, [token]);

  if (state.kind === "verifying") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-sm text-gray-600">
        <Spinner />
        <p>Confirming your email address…</p>
      </div>
    );
  }

  const next =
    hydrated && signedIn ? (
      <Link href="/dashboard" className={linkClass}>
        Go to your dashboard
      </Link>
    ) : (
      <Link href="/login" className={linkClass}>
        Sign in
      </Link>
    );

  return (
    <div className="space-y-4">
      <div
        role="status"
        className={
          state.kind === "done"
            ? "rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
            : "rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        }
      >
        <p>{state.message}</p>
        {state.kind === "done" && (
          <p className="mt-2">You can now post tasks and apply for them.</p>
        )}
      </div>
      {next}
    </div>
  );
}
