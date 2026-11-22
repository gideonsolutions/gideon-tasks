import Link from "next/link";
import { taxRequirement } from "@/lib/constants";

/**
 * The Tax Prep rules, on a Tax Prep task's page and in the task form when
 * Tax Prep is selected. Nothing for other categories.
 */
export function TaxPrepNotice({
  categorySlug,
  inForm = false,
}: {
  categorySlug: string | null | undefined;
  inForm?: boolean;
}) {
  if (!taxRequirement(categorySlug)) return null;
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
      <p className="font-semibold">Tax Prep</p>
      <ul className="list-disc pl-5 space-y-1">
        {inForm && (
          <li>Say which returns, which tax years and which states.</li>
        )}
        <li>
          Never put a Social Security number, ITIN, tax documents or account
          numbers in the task or its messages. Tasks are public.
        </li>
        <li>
          Only preparers whose PTIN Gideon Tasks has recorded for this calendar
          year can apply, ask questions or be booked.
        </li>
        <li>
          Gideon Tasks doesn&apos;t hold tax documents and has no upload. To
          hand over documents, meet in person at a public place, such as a
          library.
        </li>
      </ul>
      <p>
        <Link href="/tax-prep" className="font-medium text-blue-700 hover:underline">
          How Tax Prep works
        </Link>
      </p>
    </div>
  );
}
