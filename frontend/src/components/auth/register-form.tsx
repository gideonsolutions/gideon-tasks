"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/use-auth";
import type { ApiError, RegisterResponse } from "@/lib/types";

interface RegisterFormProps {
  inviteCode?: string;
}

export function RegisterForm({ inviteCode = "" }: RegisterFormProps) {
  const [form, setForm] = useState({
    invite_code: inviteCode,
    legal_first_name: "",
    legal_last_name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResponse | null>(null);
  const { register } = useAuth();

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const code = form.invite_code.trim();
      setResult(await register({ ...form, invite_code: code || undefined }));
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.error ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <p className="font-medium">{result.message}</p>
          {result.email_verification_required && result.verification_email_sent && (
            <p className="mt-2">
              We sent it to {form.email}. The link expires in 24 hours. You can
              sign in now, but you need to confirm your email address before
              you can post or apply for tasks.
            </p>
          )}
        </div>
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="legal_first_name"
          label="First Name"
          required
          value={form.legal_first_name}
          onChange={(e) => update("legal_first_name", e.target.value)}
        />
        <Input
          id="legal_last_name"
          label="Last Name"
          required
          value={form.legal_last_name}
          onChange={(e) => update("legal_last_name", e.target.value)}
        />
      </div>
      <Input
        id="email"
        label="Email"
        type="email"
        required
        value={form.email}
        onChange={(e) => update("email", e.target.value)}
        placeholder="you@example.com"
      />
      <Input
        id="phone"
        label="Phone"
        type="tel"
        required
        value={form.phone}
        onChange={(e) => update("phone", e.target.value)}
        placeholder="+1 (555) 123-4567"
      />
      <Input
        id="password"
        label="Password"
        type="password"
        required
        minLength={8}
        value={form.password}
        onChange={(e) => update("password", e.target.value)}
        placeholder="Min 8 characters"
      />
      <div className="space-y-1">
        <Input
          id="invite_code"
          label="Invite Code (optional)"
          value={form.invite_code}
          onChange={(e) => update("invite_code", e.target.value)}
          placeholder="Leave blank if you don't have one"
          aria-describedby="invite_code_help"
        />
        <p id="invite_code_help" className="text-xs text-gray-500">
          Invites come from a church, nonprofit or other organization that
          vouches for you, which raises your trust. You can sign up without
          one.
        </p>
      </div>
      <Button type="submit" loading={loading} className="w-full">
        Create Account
      </Button>
    </form>
  );
}
