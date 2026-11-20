"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store/auth";
import * as authApi from "@/lib/api/auth";
import type { ApiError } from "@/lib/types";

const linkClass =
  "inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  // Keep the token out of the address bar and browser history once read.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (!token) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-red-700">
          This link is missing its reset code. Open the link from the email again,
          or ask for a new one.
        </p>
        <Link href="/forgot-password" className={linkClass}>
          Ask for a new link
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.resetPassword({ token, password });
      // Any session in this browser was revoked on the server too.
      const store = useAuthStore.getState();
      if (store.accessToken) store.logout();
      setDone(res.message);
    } catch (err) {
      setError((err as ApiError).error ?? "We could not reset your password.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {done}
        </div>
        <Link href="/login" className={linkClass}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Ask for a new link
          </Link>
        </div>
      )}
      <Input
        id="password"
        label="New password"
        type="password"
        required
        minLength={8}
        maxLength={200}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
      />
      <Input
        id="confirm"
        label="Confirm new password"
        type="password"
        required
        minLength={8}
        maxLength={200}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button type="submit" loading={loading} className="w-full">
        Change password
      </Button>
    </form>
  );
}
