"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import * as adminApi from "@/lib/api/admin";
import type { ApiError } from "@/lib/types";

export default function DisputesPage() {
  const { addToast } = useToast();
  const { data: disputes, loading, refetch } = useApi(
    () => adminApi.listDisputes(),
    [],
  );
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleResolve(id: string) {
    if (!resolution.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.resolveDispute(id, { resolution });
      addToast("Dispute resolved", "success");
      setResolvingId(null);
      setResolution("");
      refetch();
    } catch (err) {
      addToast((err as ApiError).error ?? "Failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!disputes?.length) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-gray-500">No open disputes.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {(disputes as Record<string, unknown>[]).map((dispute) => {
        const id = dispute.id as string;
        return (
          <Card key={id}>
            <CardContent>
              <p className="text-sm text-gray-700 mb-2">
                Task: {(dispute.task_id as string)?.slice(0, 8)}...
              </p>
              {resolvingId === id ? (
                <div className="space-y-2">
                  <Textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Enter resolution..."
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      loading={submitting}
                      onClick={() => handleResolve(id)}
                    >
                      Submit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setResolvingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" onClick={() => setResolvingId(id)}>
                  Resolve
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
