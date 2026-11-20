import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password — Gideon Tasks",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Reset your password</CardTitle>
          </CardHeader>
          <CardContent>
            <ForgotPasswordForm />
            <p className="mt-4 text-center text-sm text-gray-600">
              <Link href="/login" className="text-blue-600 hover:underline">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
