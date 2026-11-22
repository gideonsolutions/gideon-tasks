"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/use-auth";
import { CONTACT_URL, meetsTaxRequirement, taxRequirement } from "@/lib/constants";

/**
 * On a Tax Prep task, shows its children (the apply form) only to a preparer
 * whose PTIN Gideon Tasks has recorded for this calendar year, and on an IRS
 * Notices & Representation task only to one with a recorded credential;
 * everyone else sees how to get them recorded. On other tasks it
 * shows the children. The API enforces the rule; this only explains it.
 */
export function PreparerRequired({
  categorySlug,
  children,
}: {
  categorySlug: string | null | undefined;
  children: React.ReactNode;
}) {
  const { user, fetchUser } = useAuth();
  const requirement = taxRequirement(categorySlug);

  // The signed-in user is cached from login, so read it again in case an
  // admin has recorded a PTIN since.
  useEffect(() => {
    if (requirement) void fetchUser();
  }, [requirement, fetchUser]);

  if (!requirement || (user && meetsTaxRequirement(requirement, user))) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-2 text-sm text-gray-700">
      {requirement === "ptin" ? (
        <p>
          Only preparers whose PTIN Gideon Tasks has recorded for this
          calendar year can apply to Tax Prep tasks.
        </p>
      ) : (
        <p>
          Only enrolled agents, CPAs and attorneys whose credential Gideon
          Tasks has recorded can apply to IRS Notices &amp; Representation
          tasks.
        </p>
      )}
      <p>
        To have yours recorded,{" "}
        <a href={CONTACT_URL} className="text-blue-600 hover:underline">
          contact us
        </a>
        . See{" "}
        <Link href="/tax-prep#preparers" className="text-blue-600 hover:underline">
          Tax Prep for preparers
        </Link>{" "}
        for what we check.
      </p>
    </div>
  );
}
