import { Badge } from "@/components/ui/badge";
import { preparerBadgeLabels } from "@/lib/constants";
import type { PreparerBadges as Badges } from "@/lib/types";

/**
 * A tasker's recorded credential ("Enrolled Agent", "CPA", "Attorney") and
 * "PTIN on file for <year>" for the current year. The PTIN is never shown.
 */
export function PreparerBadges({ badges }: { badges: Badges | null | undefined }) {
  const labels = badges ? preparerBadgeLabels(badges) : [];
  if (labels.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((label) => (
        <Badge key={label} className="bg-green-100 text-green-800">
          {label}
        </Badge>
      ))}
    </span>
  );
}
