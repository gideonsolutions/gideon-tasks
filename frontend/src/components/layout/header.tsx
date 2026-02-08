"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/use-auth";

export function Header() {
  const { isAuthenticated, user, isAdmin, logout } = useAuth();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-bold text-blue-600">
          Gideon Tasks
        </Link>

        <nav className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Dashboard
              </Link>
              <Link
                href="/tasks/new"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Post Task
              </Link>
              {isAdmin && (
                <Link
                  href="/admin/moderation"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/profile"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {user?.legal_first_name ?? "Profile"}
              </Link>
              <button
                onClick={logout}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
