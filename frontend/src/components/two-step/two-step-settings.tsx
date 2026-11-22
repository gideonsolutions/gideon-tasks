"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils/format";
import * as twoStepApi from "@/lib/api/two-step";
import type { ApiError, TwoStepSetup } from "@/lib/types";

/**
 * Turning two-step sign-in on (scan a QR code, confirm a code with the
 * password, save 10 recovery codes shown once), replacing recovery codes,
 * and turning it off (the password and a code).
 */
export function TwoStepSettings() {
  const { addToast } = useToast();
  const { isAdmin, setTokens, fetchUser } = useAuth();
  const { data: status, loading, refetch } = useApi(() => twoStepApi.getTwoStepStatus(), []);
  const [setup, setSetup] = useState<TwoStepSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  function clearForm() {
    setPassword("");
    setCode("");
  }

  async function run<T>(fn: () => Promise<T>, done?: (r: T) => void) {
    setBusy(true);
    try {
      const r = await fn();
      done?.(r);
    } catch (err) {
      addToast((err as ApiError).error ?? "That didn't work", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !status) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (!status) return null;

  const why = (
    <p className="text-sm text-gray-700">
      After your password, signing in also asks for a 6-digit code from an
      authenticator app on your phone (such as Google Authenticator, Microsoft
      Authenticator or 1Password). It is <strong>required</strong>{" "}
      {isAdmin ? "for your admin account, and " : ""}for anyone who shares
      documents on Tax Prep tasks or sends proof of a PTIN or credential.
      Anyone else can turn it on.
    </p>
  );

  if (!status.available) {
    return (
      <Card>
        <CardContent className="space-y-2">
          {why}
          <p className="text-sm text-gray-700">Two-step sign-in isn&apos;t available yet.</p>
        </CardContent>
      </Card>
    );
  }

  if (codes) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Save your recovery codes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-700">
            Each code signs you in once if you lose your phone. They are shown
            only now: print them or keep them in a password manager. We store
            only a scrambled copy and can&apos;t show them again.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-gray-900">
            {codes.map((c) => (
              <li key={c} className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                {c}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            onClick={() => {
              setCodes(null);
              refetch();
            }}
          >
            I&apos;ve saved them
          </Button>
        </CardContent>
      </Card>
    );
  }

  const passwordAndCode = (
    <>
      <Input
        id="two_step_password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Input
        id="two_step_code"
        label="Code from your app (or a recovery code)"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
      />
    </>
  );

  if (!status.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Two-step sign-in is off</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {why}
          {!setup ? (
            <Button size="sm" loading={busy} onClick={() => run(() => twoStepApi.startTwoStepSetup(), setSetup)}>
              Set up two-step sign-in
            </Button>
          ) : (
            <div className="space-y-4">
              <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
                <li>In your authenticator app, add an account and scan this code.</li>
                <li>
                  Or type this key instead:{" "}
                  <span className="font-mono text-gray-900 break-all">{setup.key}</span>
                </li>
                <li>Enter your password and the 6-digit code the app shows.</li>
              </ol>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: SVG made on the server, not a remote image */}
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qr_svg)}`}
                alt="QR code for your authenticator app"
                width={200}
                height={200}
                className="rounded border border-gray-200 bg-white"
              />
              {passwordAndCode}
              <Button
                size="sm"
                loading={busy}
                disabled={!password || !code.trim()}
                onClick={() =>
                  run(
                    () => twoStepApi.enableTwoStep(password, code),
                    (r) => {
                      // A new session that has passed two-step sign-in; the others are signed out.
                      setTokens(r.access_token, r.refresh_token);
                      void fetchUser();
                      clearForm();
                      setSetup(null);
                      setCodes(r.recovery_codes);
                    },
                  )
                }
              >
                Turn on two-step sign-in
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-step sign-in is on</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {why}
        <p className="text-sm text-gray-700">
          On since {status.enabled_at ? formatDate(status.enabled_at) : "—"}.{" "}
          {status.recovery_codes_left} of 10 recovery codes left.
          {status.recovery_codes_left <= 3 && " Replace them soon."}
        </p>
        {!status.session_verified && (
          <p className="text-sm font-medium text-amber-800">
            This session started before two-step sign-in was on. Sign out and
            sign in again with a code to share documents.
          </p>
        )}
        <div className="space-y-3 border-t border-gray-100 pt-4">
          {passwordAndCode}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              disabled={!password || !code.trim()}
              onClick={() =>
                run(
                  () => twoStepApi.replaceRecoveryCodes(password, code),
                  (r) => {
                    clearForm();
                    setCodes(r.recovery_codes);
                  },
                )
              }
            >
              Replace recovery codes
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={busy}
              disabled={!password || !code.trim()}
              onClick={() =>
                run(
                  () => twoStepApi.disableTwoStep(password, code),
                  (r) => {
                    setTokens(r.access_token, r.refresh_token);
                    void fetchUser();
                    clearForm();
                    addToast("Two-step sign-in is off", "success");
                    refetch();
                  },
                )
              }
            >
              Turn off
            </Button>
          </div>
          {isAdmin && (
            <p className="text-xs text-gray-600">
              Admin pages for documents and proofs need two-step sign-in; turning
              it off closes them to you.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
