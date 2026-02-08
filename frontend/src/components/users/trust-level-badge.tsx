import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import { TRUST_LEVEL_NAMES } from "@/lib/constants";

interface TrustLevelBadgeProps {
  trustLevel: number;
}

const levelStyles: Record<number, string> = {
  0: "bg-gray-100 text-gray-700",
  1: "bg-blue-100 text-blue-700",
  2: "bg-purple-100 text-purple-700",
  3: "bg-amber-100 text-amber-700",
};

export function TrustLevelBadge({ trustLevel }: TrustLevelBadgeProps) {
  const name = TRUST_LEVEL_NAMES[trustLevel] ?? `Level ${trustLevel}`;
  const style = levelStyles[trustLevel] ?? "bg-gray-100 text-gray-700";

  return (
    <Badge className={clsx(style)}>
      {name}
    </Badge>
  );
}
