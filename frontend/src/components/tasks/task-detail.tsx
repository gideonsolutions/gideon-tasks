"use client";

import type { Task } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskStatusBadge } from "./task-status-badge";
import { FeeBreakdownDisplay } from "./fee-breakdown";
import { formatCents, formatDate, formatDateTime } from "@/lib/utils/format";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task }: TaskDetailProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle>{task.title}</CardTitle>
            <TaskStatusBadge status={task.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-1">Description</h4>
            <p className="text-gray-700 whitespace-pre-wrap">{task.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Price</h4>
              <p className="text-lg font-semibold text-blue-600">
                {formatCents(task.price_cents)}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Deadline</h4>
              <p className="text-gray-700">{formatDate(task.deadline)}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Location</h4>
              <p className="text-gray-700">
                {task.location_type === "remote" ? "Remote" : "In Person"}
                {task.location_address && ` — ${task.location_address}`}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Posted</h4>
              <p className="text-gray-700">{formatDateTime(task.created_at)}</p>
            </div>
          </div>
          {task.rejection_reason && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <h4 className="text-sm font-medium text-red-800 mb-1">Rejection Reason</h4>
              <p className="text-sm text-red-700">{task.rejection_reason}</p>
            </div>
          )}
          {task.moderation_note && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
              <h4 className="text-sm font-medium text-yellow-800 mb-1">Moderation Note</h4>
              <p className="text-sm text-yellow-700">{task.moderation_note}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <FeeBreakdownDisplay priceCents={task.price_cents} />
    </div>
  );
}
