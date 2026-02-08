import Link from "next/link";
import type { Task } from "@/lib/types";
import { TaskStatusBadge } from "./task-status-badge";
import { formatCents, formatDate, formatRelative } from "@/lib/utils/format";

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  return (
    <Link href={`/tasks/${task.id}`} className="block">
      <div className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium text-gray-900 line-clamp-1">{task.title}</h3>
          <TaskStatusBadge status={task.status} />
        </div>
        <p className="text-sm text-gray-600 line-clamp-2 mb-3">{task.description}</p>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-blue-600">
            {formatCents(task.price_cents)}
          </span>
          <div className="flex items-center gap-3 text-gray-500">
            <span>{task.location_type === "remote" ? "Remote" : "In Person"}</span>
            <span>Due {formatDate(task.deadline)}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Posted {formatRelative(task.created_at)}
        </p>
      </div>
    </Link>
  );
}
