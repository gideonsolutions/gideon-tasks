"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import * as authApi from "@/lib/api/auth";
import type { ApiError } from "@/lib/types";

/**
 * The server answers every request the same way, so this form shows the same
 * confirmation whether or not the address has an account.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.forgotPassword({ email });
      setSent(res.message);
    } catch (err) {
      setError((err as ApiError).error ?? "We could not send the email. Try again in a few minutes.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
      >
        {sent}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-600">
        Enter the email address you signed up with. We will send you a link to
        choose a new password.
      </p>
      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Input
        id="email"
        label="Email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <Button type="submit" loading={loading} className="w-full">
        Send reset link
      </Button>
    </form>
  );
}
