"use client";

import Link from "next/link";
import { taxRequirement } from "@/lib/constants";
import { useDocumentsEnabled } from "@/lib/hooks/use-documents-enabled";
import { TASK_DOCUMENT_RETENTION_DAYS } from "@/server/documents/rules";

/**
 * The rules for Tax Prep and IRS Notices & Representation, on the task's page
 * and in the task form when one of them is selected. Nothing for other
 * categories.
 */
export function TaxPrepNotice({
  categorySlug,
  inForm = false,
}: {
  categorySlug: string | null | undefined;
  inForm?: boolean;
}) {
  const requirement = taxRequirement(categorySlug);
  const documentsEnabled = useDocumentsEnabled(!requirement);
  if (!requirement) return null;
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
      <p className="font-semibold">
        {requirement === "ptin" ? "Tax Prep" : "IRS Notices & Representation"}
      </p>
      <ul className="list-disc pl-5 space-y-1">
        {inForm && requirement === "ptin" && (
          <li>Say which returns, which tax years and which states.</li>
        )}
        {inForm && requirement === "credential" && (
          <li>
            Say what the IRS sent (for example, the notice or letter number on
            it) and which tax years it is about.
          </li>
        )}
        <li>
          Never put a Social Security number, ITIN, tax documents or account
          numbers in the task or its messages. Tasks are public.
        </li>
        {documentsEnabled ? (
          <li>
            Once a tasker is booked, you and they can share documents in the
            task&apos;s Documents section. Only the two of you can see them,
            and they are deleted {TASK_DOCUMENT_RETENTION_DAYS} days after the
            task closes.
          </li>
        ) : (
          <li>
            Gideon Tasks doesn&apos;t hold tax documents and has no upload. To
            hand over documents, meet in person at a public place, such as a
            library.
          </li>
        )}
        {requirement === "ptin" ? (
          <li>
            Only preparers whose current PTIN Gideon Tasks has recorded can
            apply, ask questions or be booked.
          </li>
        ) : (
          <li>
            Only enrolled agents, CPAs and attorneys whose credential Gideon
            Tasks has recorded can apply, ask questions or be booked. To have a
            return prepared, post in Tax Prep instead.
          </li>
        )}
      </ul>
      <p>
        <Link
          href={requirement === "ptin" ? "/tax-prep" : "/tax-prep#irs-help"}
          className="font-medium text-blue-700 hover:underline"
        >
          {requirement === "ptin" ? "How Tax Prep works" : "How IRS Notices & Representation works"}
        </Link>
      </p>
    </div>
  );
}
