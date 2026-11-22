import Link from "next/link";
import { CLERK_HOURLY_CENTS, formatWholeDollars } from "@/server/clerk-rules";

/**
 * The home page's one link to Gideon Clerk. It sits apart from the task
 * list: Gideon Clerk is Gideon Solutions' own service, not a tasker.
 */
export function ClerkNote() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">
        Help with paperwork and online accounts
      </h2>
      <p className="mt-2 text-gray-700">
        Gideon Solutions, LLC, the company that runs Gideon Tasks, also offers
        its own service: Gideon Clerk. We help you online with forms and
        applications, getting into or setting up online accounts, and answering
        letters, for {formatWholeDollars(CLERK_HOURLY_CENTS)} an hour.{" "}
        <Link href="/clerk" className="text-blue-600 hover:underline">
          About Gideon Clerk
        </Link>
      </p>
    </section>
  );
}
