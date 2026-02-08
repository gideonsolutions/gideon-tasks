"use client";

import { useState } from "react";
import { createInvites } from "@/lib/api/invites";
import type { Invite, ApiError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

export function CreateInviteForm() {
  const [targetEmail, setTargetEmail] = useState("");
  const [count, setCount] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [createdInvites, setCreatedInvites] = useState<Invite[]>([]);
  const { addToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setCreatedInvites([]);
    try {
      const data: { target_email?: string; count?: number } = {};
      if (targetEmail.trim()) {
        data.target_email = targetEmail.trim();
      }
      if (count !== "" && count > 0) {
        data.count = count;
      }
      const invites = await createInvites(data);
      setCreatedInvites(invites);
      addToast(`Created ${invites.length} invite(s)`, "success");
      setTargetEmail("");
      setCount("");
    } catch (err) {
      const apiError = err as ApiError;
      addToast(apiError.error ?? "Failed to create invites", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Invites</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="target-email"
            label="Target Email (optional)"
            type="email"
            placeholder="user@example.com"
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value)}
          />
          <Input
            id="count"
            label="Count (optional)"
            type="number"
            min={1}
            placeholder="1"
            value={count}
            onChange={(e) =>
              setCount(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
          <Button type="submit" loading={loading}>
            Create Invites
          </Button>
        </form>

        {createdInvites.length > 0 && (
          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-medium text-gray-700">Created Invite Codes</h3>
            <div className="rounded-md border border-green-200 bg-green-50 p-4">
              <ul className="space-y-1">
                {createdInvites.map((invite) => (
                  <li key={invite.id} className="font-mono text-sm text-green-800">
                    {invite.code}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
