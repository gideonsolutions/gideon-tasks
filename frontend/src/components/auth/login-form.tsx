"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/use-auth";
import { CONTACT_URL } from "@/lib/constants";
import type { ApiError } from "@/lib/types";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set after the right password on an account with two-step sign-in.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const { login, completeTwoStep } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const next = await login(email, password);
      if (next) {
        setPendingToken(next.pendingToken);
        setPassword("");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.error ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setError("");
    setLoading(true);
    try {
      const session = await completeTwoStep(pendingToken, code);
      if (session.recovery_codes_left != null && session.recovery_codes_left <= 3) {
        router.push("/profile/security");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.error ?? "That code didn't work");
      if (apiError.status === 401) {
        // The 5-minute sign-in expired: start again.
        setPendingToken(null);
        setCode("");
      }
    } finally {
      setLoading(false);
    }
  }

  if (pendingToken) {
    return (
      <form onSubmit={handleCode} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <p className="text-sm text-gray-700">
          Enter the 6-digit code from your authenticator app, or one of your
          recovery codes.
        </p>
        <Input
          id="two_step_code"
          label="Code"
          required
          autoComplete="one-time-code"
          inputMode="text"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
        />
        <Button type="submit" loading={loading} className="w-full">
          Continue
        </Button>
        <p className="text-sm text-gray-600">
          Lost your phone and your recovery codes?{" "}
          <a href={CONTACT_URL} className="text-blue-600 hover:underline">
            Write to us
          </a>
          : an admin can reset two-step sign-in after confirming who you are.{" "}
          <button
            type="button"
            className="text-blue-600 hover:underline"
            onClick={() => {
              setPendingToken(null);
              setCode("");
              setError("");
            }}
          >
            Start again
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Input
        id="email"
        label="Email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <Input
        id="password"
        label="Password"
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Min 8 characters"
      />
      <p className="text-right text-sm">
        <Link href="/forgot-password" className="text-blue-600 hover:underline">
          Forgot password?
        </Link>
      </p>
      <Button type="submit" loading={loading} className="w-full">
        Sign In
      </Button>
    </form>
  );
}
