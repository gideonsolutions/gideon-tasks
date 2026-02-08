"use client";

import { Header } from "@/components/layout/header";
import { VerifyForm } from "@/components/auth/verify-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Verify Your Account</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Enter the codes sent to your email and phone.
            </p>
          </CardHeader>
          <CardContent>
            <VerifyForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
