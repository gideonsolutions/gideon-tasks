"use client";

import { use } from "react";
import { Header } from "@/components/layout/header";
import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useApi } from "@/lib/hooks/use-api";
import * as invitesApi from "@/lib/api/invites";

export default function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { data: invite, loading, error } = useApi(
    () => invitesApi.validateInvite(code),
    [code],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>You&apos;ve Been Invited</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : error ? (
              <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                {error.error ?? "Invalid or expired invite code."}
              </div>
            ) : invite ? (
              <RegisterForm inviteCode={code} />
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
