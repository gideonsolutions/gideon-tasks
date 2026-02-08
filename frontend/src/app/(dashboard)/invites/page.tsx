"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils/format";
import * as invitesApi from "@/lib/api/invites";
import type { ApiError, Invite } from "@/lib/types";

export default function InvitesPage() {
  const { data: invites, loading, refetch } = useApi(
    () => invitesApi.listInvites(),
    [],
  );
  const { addToast } = useToast();
  const [email, setEmail] = useState("");
  const [count, setCount] = useState("1");
  const [creating, setCreating] = useState(false);
  const [newInvites, setNewInvites] = useState<Invite[]>([]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const result = await invitesApi.createInvites({
        target_email: email || undefined,
        count: parseInt(count) || 1,
      });
      setNewInvites(result);
      addToast("Invites created", "success");
      setEmail("");
      setCount("1");
      refetch();
    } catch (err) {
      addToast((err as ApiError).error ?? "Failed", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Invites</h1>

      <Card>
        <CardHeader>
          <CardTitle>Create Invites</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3">
            <Input
              id="target_email"
              label="Target Email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
            <Input
              id="count"
              label="Number of Invites"
              type="number"
              min="1"
              max="50"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
            <Button type="submit" loading={creating} size="sm">
              Create
            </Button>
          </form>
          {newInvites.length > 0 && (
            <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-3">
              <p className="text-sm font-medium text-green-800 mb-2">
                Created {newInvites.length} invite(s):
              </p>
              {newInvites.map((inv) => (
                <p key={inv.id} className="text-sm font-mono text-green-700">
                  {inv.code}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Invites</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Spinner />
          ) : !invites?.length ? (
            <p className="text-gray-500">No invites yet.</p>
          ) : (
            <div className="space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between border-b border-gray-100 pb-2"
                >
                  <div>
                    <span className="font-mono text-sm">{invite.code}</span>
                    {invite.target_email && (
                      <span className="text-sm text-gray-500 ml-2">
                        ({invite.target_email})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {invite.claimed_by ? (
                      <Badge className="bg-green-100 text-green-700">Claimed</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-700">Available</Badge>
                    )}
                    <span className="text-xs text-gray-400">
                      Exp: {formatDate(invite.expires_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
