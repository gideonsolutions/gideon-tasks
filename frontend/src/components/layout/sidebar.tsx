"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/lib/hooks/use-auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks/new", label: "Post a Task", minTrust: 1 },
  { href: "/profile", label: "My Profile" },
  { href: "/profile/stripe", label: "Stripe Connect" },
  { href: "/invites", label: "Invites" },
  { href: "/attestations", label: "Attestations" },
];

const adminItems = [
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/users", label: "Users" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, trustLevel } = useAuth();

  return (
    <aside className="w-64 border-r border-gray-200 bg-white">
      <nav className="flex flex-col gap-1 p-4">
        <p className="mb-2 text-xs font-semibold uppercase text-gray-400">
          Navigation
        </p>
        {navItems
          .filter((item) => !item.minTrust || trustLevel >= item.minTrust)
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              )}
            >
              {item.label}
            </Link>
          ))}

        {isAdmin && (
          <>
            <p className="mb-2 mt-6 text-xs font-semibold uppercase text-gray-400">
              Admin
            </p>
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
              >
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
