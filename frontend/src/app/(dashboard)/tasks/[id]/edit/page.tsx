"use client";

import { use } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TaskForm } from "@/components/tasks/task-form";
import { Spinner } from "@/components/ui/spinner";
import { useApi } from "@/lib/hooks/use-api";
import * as tasksApi from "@/lib/api/tasks";

export default function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: task, loading } = useApi(() => tasksApi.getTask(id), [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-700">
        Task not found
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Edit Task</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskForm
            mode="edit"
            taskId={id}
            initialData={{
              title: task.title,
              description: task.description,
              category_id: task.category_id,
              location_type: task.location_type,
              location_address: task.location_address ?? undefined,
              price_cents: task.price_cents,
              deadline: task.deadline,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
