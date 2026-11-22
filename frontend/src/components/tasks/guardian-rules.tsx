import Link from "next/link";

/**
 * The rules for a Tutoring task a parent or guardian posted for their child
 * (tasks.for_minor). Shown on the task page and in the task form.
 */
export function GuardianRules({ inForm = false }: { inForm?: boolean }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
      <p className="font-semibold">Tutoring for a child under 18</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          A parent or legal guardian holds the account and posts the task. The
          child does not have an account.
        </li>
        <li>
          Only tutors whose background check Gideon Tasks has recorded can
          apply, ask questions or be booked.
        </li>
        <li>
          Sessions are online, or in person at a public place the parent or
          guardian has confirmed. Never at anyone&apos;s home.
        </li>
        <li>A parent or guardian is present or reachable during every session.</li>
        <li>
          No contact with the child off Gideon Tasks or outside the sessions.
          The tutor arranges everything with the parent or guardian, in the
          task&apos;s messages.
        </li>
        {inForm && (
          <li>
            The task, including the place, is visible to everyone. Do not
            include your child&apos;s name or school.
          </li>
        )}
      </ul>
      <p>
        <Link href="/safeguarding" className="font-medium text-blue-700 hover:underline">
          Read the safeguarding policy
        </Link>
      </p>
    </div>
  );
}
