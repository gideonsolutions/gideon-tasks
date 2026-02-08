"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const tabs = [
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/users", label: "Users" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="flex gap-4">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "border-b-2 pb-3 pt-2 text-sm font-medium transition-colors",
              pathname === tab.href
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
