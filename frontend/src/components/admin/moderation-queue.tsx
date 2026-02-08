"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { getModerationQueue, approveModeration, rejectModeration } from "@/lib/api/admin";
import type { ModerationLogEntry, ApiError } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/format";

export function ModerationQueue() {
  const { data: entries, loading, error, refetch } = useApi<ModerationLogEntry[]>(
    getModerationQueue,
  );
  const { addToast } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setActionLoading(`approve-${id}`);
    try {
      await approveModeration(id);
      addToast("Item approved", "success");
      refetch();
    } catch (err) {
      const apiError = err as ApiError;
      addToast(apiError.error ?? "Failed to approve", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    setActionLoading(`reject-${id}`);
    try {
      await rejectModeration(id);
      addToast("Item rejected", "success");
      refetch();
    } catch (err) {
      const apiError = err as ApiError;
      addToast(apiError.error ?? "Failed to reject", "error");
    } finally {
      setActionLoading(null);
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
        Failed to load moderation queue: {error.error}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-500">No items pending moderation</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Moderation Queue</h2>
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardHeader>
            <CardTitle>
              {entry.entity_type} &mdash; {entry.entity_id}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="font-medium">Action:</span>
                <Badge>{entry.action}</Badge>
              </div>
              {entry.reason && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Reason:</span> {entry.reason}
                </div>
              )}
              <div className="text-xs text-gray-400">
                {formatDateTime(entry.created_at)}
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={actionLoading === `approve-${entry.id}`}
                  onClick={() => handleApprove(entry.id)}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={actionLoading === `reject-${entry.id}`}
                  onClick={() => handleReject(entry.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
