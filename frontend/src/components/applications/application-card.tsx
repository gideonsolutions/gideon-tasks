import type { TaskApplication } from "@/lib/types";
import { formatRelative, formatStatus } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ApplicationCardProps {
  application: TaskApplication;
  onAccept?: (applicationId: string) => void;
}

export function ApplicationCard({ application, onAccept }: ApplicationCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-900">
            Applicant: {application.doer_id}
          </p>
          <Badge>{formatStatus(application.status)}</Badge>
        </div>
        <span className="text-xs text-gray-500">
          {formatRelative(application.created_at)}
        </span>
      </div>
      {application.message && (
        <p className="mt-2 text-sm text-gray-600">{application.message}</p>
      )}
      {application.status === "pending" && onAccept && (
        <div className="mt-3">
          <Button
            size="sm"
            onClick={() => onAccept(application.id)}
          >
            Accept
          </Button>
        </div>
      )}
    </div>
  );
}
