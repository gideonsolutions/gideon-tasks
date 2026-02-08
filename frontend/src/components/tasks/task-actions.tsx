"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getAvailableActions, type UserRole } from "@/lib/utils/task-status";
import type { Task, ApiError } from "@/lib/types";
import * as tasksApi from "@/lib/api/tasks";

interface TaskActionsProps {
  task: Task;
  role: UserRole;
  onUpdate: () => void;
}

export function TaskActions({ task, role, onUpdate }: TaskActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { addToast } = useToast();

  const actions = getAvailableActions(task.status, role);

  if (actions.length === 0) return null;

  async function handleAction(targetStatus: string) {
    setLoading(targetStatus);
    try {
      switch (targetStatus) {
        case "pending_review":
          await tasksApi.publishTask(task.id);
          break;
        case "cancelled":
          await tasksApi.cancelTask(task.id);
          break;
        case "in_progress":
          await tasksApi.startTask(task.id);
          break;
        case "submitted":
          await tasksApi.submitTask(task.id);
          break;
        case "completed":
          await tasksApi.approveTask(task.id);
          break;
        case "disputed":
          await tasksApi.disputeTask(task.id);
          break;
      }
      addToast("Task updated successfully", "success");
      onUpdate();
    } catch (err) {
      const apiError = err as ApiError;
      addToast(apiError.error ?? "Action failed", "error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex gap-2">
      {actions.map((action) => (
        <Button
          key={action.targetStatus}
          variant={action.variant === "primary" ? "primary" : action.variant}
          size="sm"
          loading={loading === action.targetStatus}
          onClick={() => handleAction(action.targetStatus)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
