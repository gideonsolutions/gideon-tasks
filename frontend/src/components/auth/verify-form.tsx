"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import * as authApi from "@/lib/api/auth";
import type { ApiError } from "@/lib/types";

export function VerifyForm() {
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerifyEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.verifyEmail({ code: emailCode });
      setEmailVerified(true);
    } catch (err) {
      setError((err as ApiError).error ?? "Email verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPhone(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.verifyPhone({ code: phoneCode });
      setPhoneVerified(true);
    } catch (err) {
      setError((err as ApiError).error ?? "Phone verification failed");
    } finally {
      setLoading(false);
    }
  }

  if (emailVerified && phoneVerified) {
    return (
      <div className="rounded-md bg-green-50 border border-green-200 p-4 text-center">
        <p className="text-green-800 font-medium">All verified! You can now log in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <form onSubmit={handleVerifyEmail} className="space-y-3">
        <h3 className="font-medium text-gray-900">Verify Email</h3>
        {emailVerified ? (
          <p className="text-sm text-green-600">Email verified</p>
        ) : (
          <>
            <Input
              id="email_code"
              placeholder="Enter email verification code"
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value)}
              required
            />
            <Button type="submit" loading={loading} size="sm">
              Verify Email
            </Button>
          </>
        )}
      </form>
      <form onSubmit={handleVerifyPhone} className="space-y-3">
        <h3 className="font-medium text-gray-900">Verify Phone</h3>
        {phoneVerified ? (
          <p className="text-sm text-green-600">Phone verified</p>
        ) : (
          <>
            <Input
              id="phone_code"
              placeholder="Enter phone verification code"
              value={phoneCode}
              onChange={(e) => setPhoneCode(e.target.value)}
              required
            />
            <Button type="submit" loading={loading} size="sm">
              Verify Phone
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
