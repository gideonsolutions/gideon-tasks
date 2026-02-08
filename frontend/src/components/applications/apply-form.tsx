"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createApplication } from "@/lib/api/applications";
import type { ApiError } from "@/lib/types";

interface ApplyFormProps {
  taskId: string;
  onSuccess?: () => void;
}

export function ApplyForm({ taskId, onSuccess }: ApplyFormProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await createApplication(taskId, {
        message: message.trim() || undefined,
      });
      addToast("Application submitted successfully", "success");
      setMessage("");
      onSuccess?.();
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.status === 202) {
        addToast("Your application was flagged for review", "warning");
      } else {
        setError(apiError.error ?? "Failed to submit application");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Textarea
        id="application-message"
        label="Message (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Why are you a good fit for this task?"
      />
      <Button type="submit" loading={loading}>
        Apply
      </Button>
    </form>
  );
}
