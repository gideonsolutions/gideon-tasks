"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils/format";
import * as attestationsApi from "@/lib/api/attestations";
import type { ApiError } from "@/lib/types";

export default function AttestationsPage() {
  const { data: attestations, loading, refetch } = useApi(
    () => attestationsApi.listAttestations(),
    [],
  );
  const { addToast } = useToast();
  const [acting, setActing] = useState<string | null>(null);

  async function handleConfirm(id: string) {
    setActing(id);
    try {
      await attestationsApi.confirmAttestation(id);
      addToast("Attestation confirmed", "success");
      refetch();
    } catch (err) {
      addToast((err as ApiError).error ?? "Failed", "error");
    } finally {
      setActing(null);
    }
  }

  async function handleRevoke(id: string) {
    setActing(id);
    try {
      await attestationsApi.revokeAttestation(id);
      addToast("Attestation revoked", "success");
      refetch();
    } catch (err) {
      addToast((err as ApiError).error ?? "Failed", "error");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Attestations</h1>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : !attestations?.length ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">No attestations.</p>
          </CardContent>
        </Card>
      ) : (
        attestations.map((att) => (
          <Card key={att.id}>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  User: {att.user_id.slice(0, 8)}...
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    className={
                      att.status === "confirmed"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }
                  >
                    {att.status}
                  </Badge>
                  {att.confirmed_at && (
                    <span className="text-xs text-gray-400">
                      Confirmed {formatDate(att.confirmed_at)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {att.status === "pending" && (
                  <Button
                    size="sm"
                    loading={acting === att.id}
                    onClick={() => handleConfirm(att.id)}
                  >
                    Confirm
                  </Button>
                )}
                {att.status === "confirmed" && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={acting === att.id}
                    onClick={() => handleRevoke(att.id)}
                  >
                    Revoke
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
