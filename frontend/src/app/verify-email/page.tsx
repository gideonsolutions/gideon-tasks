import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { VerifyEmailResult } from "@/components/auth/verify-email-result";

export const metadata: Metadata = {
  title: "Confirm your email — Gideon Tasks",
  robots: { index: false },
};

export default async function VerifyEmailPage({
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
            <CardTitle>Confirm your email</CardTitle>
          </CardHeader>
          <CardContent>
            <VerifyEmailResult token={typeof token === "string" ? token : ""} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
