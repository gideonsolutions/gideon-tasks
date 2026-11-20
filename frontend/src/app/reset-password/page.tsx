import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password — Gideon Tasks",
  robots: { index: false },
  // The reset token is in the URL; never send it to another site.
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
          </CardHeader>
          <CardContent>
            <ResetPasswordForm token={typeof token === "string" ? token : ""} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
