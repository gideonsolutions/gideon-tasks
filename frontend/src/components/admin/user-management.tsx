"use client";

import { useState } from "react";
import { suspendUser, banUser } from "@/lib/api/admin";
import type { ApiError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface UserManagementProps {
  userId: string;
}

type PendingAction = "suspend" | "ban" | null;

export function UserManagement({ userId }: UserManagementProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  async function handleConfirm() {
    if (!pendingAction) return;
    setLoading(true);
    try {
      if (pendingAction === "suspend") {
        await suspendUser(userId);
        addToast("User suspended", "success");
      } else {
        await banUser(userId);
        addToast("User banned", "success");
      }
      setPendingAction(null);
    } catch (err) {
      const apiError = err as ApiError;
      addToast(apiError.error ?? `Failed to ${pendingAction} user`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="warning"
        size="sm"
        onClick={() => setPendingAction("suspend")}
      >
        Suspend
      </Button>
      <Button
        variant="danger"
        size="sm"
        onClick={() => setPendingAction("ban")}
      >
        Ban
      </Button>

      <Dialog
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={pendingAction === "suspend" ? "Suspend User" : "Ban User"}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to {pendingAction} user{" "}
            <span className="font-mono font-medium">{userId}</span>? This action
            will take effect immediately.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPendingAction(null)}
            >
              Cancel
            </Button>
            <Button
              variant={pendingAction === "ban" ? "danger" : "warning"}
              size="sm"
              loading={loading}
              onClick={handleConfirm}
            >
              {pendingAction === "suspend" ? "Suspend" : "Ban"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
