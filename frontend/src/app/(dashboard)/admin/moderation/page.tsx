"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatRelative } from "@/lib/utils/format";
import * as adminApi from "@/lib/api/admin";
import type { ApiError } from "@/lib/types";

export default function ModerationPage() {
  const { addToast } = useToast();
  const { data: queue, loading, refetch } = useApi(
    () => adminApi.getModerationQueue(),
    [],
  );
  const [acting, setActing] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setActing(id);
    try {
      await adminApi.approveModeration(id);
      addToast("Approved", "success");
      refetch();
    } catch (err) {
      addToast((err as ApiError).error ?? "Failed", "error");
    } finally {
      setActing(null);
    }
  }

  async function handleReject(id: string) {
    setActing(id);
    try {
      await adminApi.rejectModeration(id);
      addToast("Rejected", "success");
      refetch();
    } catch (err) {
      addToast((err as ApiError).error ?? "Failed", "error");
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!queue?.length) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-gray-500">No items in the moderation queue.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {queue.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge>{item.entity_type}</Badge>
                <span className="text-sm text-gray-500">
                  {item.entity_id.slice(0, 8)}...
                </span>
              </div>
              {item.reason && (
                <p className="text-sm text-gray-600">{item.reason}</p>
              )}
              <p className="text-xs text-gray-400">
                {formatRelative(item.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={acting === item.id}
                onClick={() => handleApprove(item.id)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={acting === item.id}
                onClick={() => handleReject(item.id)}
              >
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
