"use client";

import { useApi } from "@/lib/hooks/use-api";
import { listAttestations } from "@/lib/api/attestations";
import type { Attestation } from "@/lib/types";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/format";
import { AttestationActions } from "./attestation-actions";

export function AttestationList() {
  const { data: attestations, loading, error, refetch } = useApi<Attestation[]>(
    listAttestations,
  );

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
        Failed to load attestations: {error.error}
      </div>
    );
  }

  if (!attestations || attestations.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-500">No attestations found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-gray-900">Attestations</h2>
      {attestations.map((attestation) => (
        <Card key={attestation.id}>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Attestor:</span>{" "}
                  <span className="font-mono">{attestation.attestor_id}</span>
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">User:</span>{" "}
                  <span className="font-mono">{attestation.user_id}</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Status:</span>
                  <Badge
                    className={
                      attestation.status === "confirmed"
                        ? "bg-green-100 text-green-700"
                        : attestation.status === "revoked"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                    }
                  >
                    {attestation.status}
                  </Badge>
                </div>
                {attestation.confirmed_at && (
                  <p className="text-xs text-gray-400">
                    Confirmed: {formatDateTime(attestation.confirmed_at)}
                  </p>
                )}
              </div>
              <AttestationActions
                attestationId={attestation.id}
                status={attestation.status}
                onUpdate={refetch}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
