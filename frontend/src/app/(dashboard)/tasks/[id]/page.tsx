"use client";

import { use } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import { TaskDetail } from "@/components/tasks/task-detail";
import { TaskActions } from "@/components/tasks/task-actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { UserRole } from "@/lib/utils/task-status";
import * as tasksApi from "@/lib/api/tasks";

export default function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, isAdmin } = useAuth();
  const { data: task, loading, error, refetch } = useApi(
    () => tasksApi.getTask(id),
    [id],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-700">
        {error?.error ?? "Task not found"}
      </div>
    );
  }

  let role: UserRole = "doer";
  if (isAdmin) role = "admin";
  else if (task.requester_id === user?.id) role = "requester";
  else if (task.assigned_doer_id === user?.id) role = "doer";

  return (
    <div className="max-w-3xl space-y-6">
      <TaskDetail task={task} />
      <div className="flex items-center gap-3">
        <TaskActions task={task} role={role} onUpdate={refetch} />
        {task.status === "draft" && role === "requester" && (
          <Link href={`/tasks/${id}/edit`}>
            <Button variant="secondary" size="sm">Edit</Button>
          </Link>
        )}
        {task.status === "published" && (
          <Link href={`/tasks/${id}/applications`}>
            <Button variant="secondary" size="sm">Applications</Button>
          </Link>
        )}
        {(task.status === "assigned" ||
          task.status === "in_progress" ||
          task.status === "submitted") && (
          <Link href={`/tasks/${id}/messages`}>
            <Button variant="secondary" size="sm">Messages</Button>
          </Link>
        )}
        {task.status === "completed" && (
          <Link href={`/tasks/${id}/review`}>
            <Button variant="secondary" size="sm">Leave Review</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
