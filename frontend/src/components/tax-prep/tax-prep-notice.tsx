import Link from "next/link";
import { taxRequirement } from "@/lib/constants";

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
        {inForm && requirement === "ptin_and_credential" && (
          <li>
            Say what the IRS sent (for example, the notice or letter number on
            it) and which tax years it is about.
          </li>
        )}
        <li>
          Never put a Social Security number, ITIN, tax documents or account
          numbers in the task or its messages. Tasks are public.
        </li>
        {requirement === "ptin" ? (
          <li>
            Only preparers whose PTIN Gideon Tasks has recorded for this
            calendar year can apply, ask questions or be booked.
          </li>
        ) : (
          <li>
            Only enrolled agents, CPAs and attorneys whose credential and PTIN
            for this calendar year Gideon Tasks has recorded can apply, ask
            questions or be booked.
          </li>
        )}
        <li>
          Gideon Tasks doesn&apos;t hold tax documents and has no upload. To
          hand over documents, meet in person at a public place, such as a
          library.
        </li>
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
