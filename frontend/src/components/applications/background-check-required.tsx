"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/use-auth";
import { CONTACT_URL } from "@/lib/constants";

/**
 * On a task for a child, shows its children (the apply form) only to a tutor
 * whose background check is recorded; everyone else sees how to get one.
 * The API enforces the rule; this only explains it.
 */
export function BackgroundCheckRequired({ children }: { children: React.ReactNode }) {
  const { user, fetchUser } = useAuth();

  // The signed-in user is cached from login, so read it again in case an
  // admin has recorded a check since.
  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  if (user?.background_check_cleared_at) return <>{children}</>;

  return (
    <div className="space-y-2 text-sm text-gray-700">
      <p>
        Only tutors whose background check Gideon Tasks has recorded can apply
        to tutoring for a child under 18.
      </p>
      <p>
        You can&apos;t request a check on the site yet. To ask about one,{" "}
        <a href={CONTACT_URL} className="text-blue-600 hover:underline">
          contact us
        </a>
        . See the{" "}
        <Link href="/safeguarding#background-checks" className="text-blue-600 hover:underline">
          safeguarding policy
        </Link>{" "}
        for how checks work.
      </p>
    </div>
  );
}
