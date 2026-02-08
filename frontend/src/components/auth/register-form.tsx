"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/use-auth";
import type { ApiError } from "@/lib/types";

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
  const { register } = useAuth();
  const router = useRouter();

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register(form);
      router.push("/register/verify");
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.error ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Input
        id="invite_code"
        label="Invite Code"
        required
        value={form.invite_code}
        onChange={(e) => update("invite_code", e.target.value)}
        placeholder="Enter your invite code"
      />
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
      <Button type="submit" loading={loading} className="w-full">
        Create Account
      </Button>
    </form>
  );
}
