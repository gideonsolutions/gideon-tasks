import type { PublicUserProfile, User } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { TrustLevelBadge } from "./trust-level-badge";
import { formatDate } from "@/lib/utils/format";

interface UserProfileCardProps {
  user: PublicUserProfile | User;
}

export function UserProfileCard({ user }: UserProfileCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-lg">
          {user.legal_first_name.charAt(0).toUpperCase()}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">
              {user.legal_first_name}
            </span>
            <TrustLevelBadge trustLevel={user.trust_level} />
          </div>
          <p className="text-xs text-gray-500">
            Member since {formatDate(user.created_at)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
