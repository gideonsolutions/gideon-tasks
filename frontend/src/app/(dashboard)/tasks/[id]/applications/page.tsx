"use client";

import { use, useState } from "react";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatRelative } from "@/lib/utils/format";
import * as applicationsApi from "@/lib/api/applications";
import * as tasksApi from "@/lib/api/tasks";
import type { ApiError } from "@/lib/types";

export default function TaskApplicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const { addToast } = useToast();
  const [assigning, setAssigning] = useState<string | null>(null);

  const { data: task } = useApi(() => tasksApi.getTask(id), [id]);
  const { data: applications, loading, refetch } = useApi(
    () => applicationsApi.listApplications(id),
    [id],
  );

  const isRequester = task?.requester_id === user?.id;

  async function handleAssign(applicationId: string) {
    setAssigning(applicationId);
    try {
      await tasksApi.assignTask(id, applicationId);
      addToast("Doer assigned successfully", "success");
      refetch();
    } catch (err) {
      addToast((err as ApiError).error ?? "Failed to assign", "error");
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Applications</h1>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !applications?.length ? (
        <Card>
          <CardContent>
            <p className="text-gray-500 text-center py-4">No applications yet.</p>
          </CardContent>
        </Card>
      ) : (
        applications.map((app) => (
          <Card key={app.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Applicant: {app.doer_id.slice(0, 8)}...
                </CardTitle>
                <span className="text-xs text-gray-500">
                  {formatRelative(app.created_at)}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {app.message && (
                <p className="text-sm text-gray-700 mb-3">{app.message}</p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Status: {app.status}</span>
                {isRequester && task?.status === "published" && app.status === "pending" && (
                  <Button
                    size="sm"
                    loading={assigning === app.id}
                    onClick={() => handleAssign(app.id)}
                  >
                    Assign
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
