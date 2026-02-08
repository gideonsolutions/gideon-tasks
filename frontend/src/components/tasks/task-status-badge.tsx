import { Badge } from "@/components/ui/badge";
import { getStatusColor } from "@/lib/utils/task-status";
import { formatStatus } from "@/lib/utils/format";
import type { TaskStatus } from "@/lib/types";

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  return (
    <Badge className={getStatusColor(status)}>
      {formatStatus(status)}
    </Badge>
  );
}
