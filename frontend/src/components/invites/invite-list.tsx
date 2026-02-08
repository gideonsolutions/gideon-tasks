"use client";

import { useApi } from "@/lib/hooks/use-api";
import { listInvites } from "@/lib/api/invites";
import type { Invite } from "@/lib/types";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/format";

export function InviteList() {
  const { data: invites, loading, error } = useApi<Invite[]>(listInvites);

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
        Failed to load invites: {error.error}
      </div>
    );
  }

  if (!invites || invites.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-500">No invites found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-gray-900">Invites</h2>
      {invites.map((invite) => (
        <Card key={invite.id}>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-mono text-sm font-medium text-gray-900">
                  {invite.code}
                </p>
                {invite.target_email && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">To:</span> {invite.target_email}
                  </p>
                )}
                {invite.claimed_by && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Claimed by:</span>{" "}
                    <span className="font-mono">{invite.claimed_by}</span>
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  Expires: {formatDate(invite.expires_at)}
                </p>
              </div>
              <div>
                {invite.claimed_by ? (
                  <Badge className="bg-green-100 text-green-700">Claimed</Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-700">Available</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
