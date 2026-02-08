"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import * as adminApi from "@/lib/api/admin";
import type { ApiError } from "@/lib/types";

export default function AdminUsersPage() {
  const { addToast } = useToast();
  const [userId, setUserId] = useState("");
  const [confirmAction, setConfirmAction] = useState<"suspend" | "ban" | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  async function handleAction() {
    if (!userId || !confirmAction) return;
    setLoading(true);
    try {
      if (confirmAction === "suspend") {
        await adminApi.suspendUser(userId);
      } else {
        await adminApi.banUser(userId);
      }
      addToast(
        `User ${confirmAction === "suspend" ? "suspended" : "banned"}`,
        "success",
      );
      setConfirmAction(null);
      setUserId("");
    } catch (err) {
      addToast((err as ApiError).error ?? "Action failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <Input
            id="user_id"
            label="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter user UUID"
          />
          <div className="flex gap-2">
            <Button
              variant="warning"
              size="sm"
              disabled={!userId}
              onClick={() => setConfirmAction("suspend")}
            >
              Suspend User
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!userId}
              onClick={() => setConfirmAction("ban")}
            >
              Ban User
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={`Confirm ${confirmAction === "suspend" ? "Suspension" : "Ban"}`}
      >
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to {confirmAction} user{" "}
          <span className="font-mono">{userId.slice(0, 8)}...</span>?
          {confirmAction === "ban" && " This action is severe and difficult to reverse."}
        </p>
        <div className="flex gap-2 justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmAction(null)}
          >
            Cancel
          </Button>
          <Button
            variant={confirmAction === "ban" ? "danger" : "warning"}
            size="sm"
            loading={loading}
            onClick={handleAction}
          >
            {confirmAction === "suspend" ? "Suspend" : "Ban"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
