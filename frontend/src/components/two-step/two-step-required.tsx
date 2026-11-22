import Link from "next/link";

/**
 * Shown where a page needs two-step sign-in and the session doesn't have it:
 * the API answered 403 with code "two_step_required".
 */
export function TwoStepRequiredNotice({ message }: { message?: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
      <p className="font-semibold">Two-step sign-in is required</p>
      <p>
        {message ??
          "Documents and proof uploads, and admin access to them, need two-step sign-in."}
      </p>
      <p>
        <Link href="/profile/security" className="font-medium text-blue-700 hover:underline">
          Set up two-step sign-in
        </Link>
      </p>
    </div>
  );
}
