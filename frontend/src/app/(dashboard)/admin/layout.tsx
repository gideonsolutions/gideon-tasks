"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AdminNav } from "@/components/layout/admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Admin</h1>
        <AdminNav />
        {children}
      </div>
    </AdminGuard>
  );
}
