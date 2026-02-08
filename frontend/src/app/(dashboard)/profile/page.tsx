"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/use-auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { TRUST_LEVEL_NAMES } from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";
import * as usersApi from "@/lib/api/users";
import type { ApiError } from "@/lib/types";

export default function ProfilePage() {
  const { user, fetchUser } = useAuth();
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    legal_first_name: user?.legal_first_name ?? "",
    legal_last_name: user?.legal_last_name ?? "",
  });
  const [loading, setLoading] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await usersApi.updateMe(form);
      await fetchUser();
      addToast("Profile updated", "success");
      setEditing(false);
    } catch (err) {
      addToast((err as ApiError).error ?? "Update failed", "error");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  value={form.legal_first_name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, legal_first_name: e.target.value }))
                  }
                />
                <Input
                  label="Last Name"
                  value={form.legal_last_name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, legal_last_name: e.target.value }))
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" loading={loading} size="sm">
                  Save
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex justify-between">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">
                    {user.legal_first_name} {user.legal_last_name}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p>
                  {user.email}{" "}
                  {user.email_verified && (
                    <Badge className="bg-green-100 text-green-700">Verified</Badge>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p>
                  {user.phone}{" "}
                  {user.phone_verified && (
                    <Badge className="bg-green-100 text-green-700">Verified</Badge>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Trust Level</p>
                <p>
                  {user.trust_level} — {TRUST_LEVEL_NAMES[user.trust_level]}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Member Since</p>
                <p>{formatDate(user.created_at)}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
