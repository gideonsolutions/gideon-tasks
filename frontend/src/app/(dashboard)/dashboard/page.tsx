"use client";

import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import { TaskList } from "@/components/tasks/task-list";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { TRUST_LEVEL_NAMES } from "@/lib/constants";
import * as tasksApi from "@/lib/api/tasks";

export default function DashboardPage() {
  const { user, trustLevel } = useAuth();

  const { data: tasks, loading } = useApi(() => tasksApi.listTasks(), []);

  const myPosted = tasks?.filter((t) => t.requester_id === user?.id) ?? [];
  const myDoer = tasks?.filter((t) => t.assigned_doer_id === user?.id) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Welcome back, {user?.legal_first_name}. Trust Level:{" "}
          <span className="font-medium">{TRUST_LEVEL_NAMES[trustLevel] ?? "Unknown"}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Tasks Posted</p>
            <p className="text-2xl font-bold">{myPosted.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Tasks Assigned to Me</p>
            <p className="text-2xl font-bold">{myDoer.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Trust Level</p>
            <p className="text-2xl font-bold">{trustLevel}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">My Posted Tasks</h2>
            <TaskList tasks={myPosted} emptyMessage="You haven't posted any tasks yet." />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Tasks I&apos;m Working On</h2>
            <TaskList tasks={myDoer} emptyMessage="You aren't assigned to any tasks." />
          </div>
        </>
      )}
    </div>
  );
}
