"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { listDisputes, resolveDispute } from "@/lib/api/admin";
import type { ApiError } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

export function DisputeResolver() {
  const { data: disputes, loading, error, refetch } = useApi<unknown[]>(
    listDisputes,
  );
  const { addToast } = useToast();
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);

  function handleResolutionChange(id: string, value: string) {
    setResolutions((prev) => ({ ...prev, [id]: value }));
  }

  async function handleResolve(id: string) {
    const resolution = resolutions[id]?.trim();
    if (!resolution) {
      addToast("Please enter a resolution", "warning");
      return;
    }
    setResolving(id);
    try {
      await resolveDispute(id, { resolution });
      addToast("Dispute resolved", "success");
      setResolutions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      refetch();
    } catch (err) {
      const apiError = err as ApiError;
      addToast(apiError.error ?? "Failed to resolve dispute", "error");
    } finally {
      setResolving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load disputes: {(error as ApiError).error}
      </div>
    );
  }

  if (!disputes || disputes.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-500">No open disputes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Disputes</h2>
      {disputes.map((dispute) => {
        const d = dispute as Record<string, unknown>;
        const id = d.id as string;
        return (
          <Card key={id}>
            <CardHeader>
              <CardTitle>Dispute {id}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {d.task_id != null && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Task:</span> {String(d.task_id)}
                  </p>
                )}
                {d.reason != null && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Reason:</span> {String(d.reason)}
                  </p>
                )}
                <Textarea
                  label="Resolution"
                  placeholder="Enter resolution details..."
                  value={resolutions[id] ?? ""}
                  onChange={(e) => handleResolutionChange(id, e.target.value)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  loading={resolving === id}
                  onClick={() => handleResolve(id)}
                >
                  Resolve
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
