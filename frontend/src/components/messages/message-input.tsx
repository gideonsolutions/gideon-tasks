"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sendMessage } from "@/lib/api/messages";
import type { ApiError } from "@/lib/types";

interface MessageInputProps {
  taskId: string;
  onSent?: () => void;
}

export function MessageInput({ taskId, onSent }: MessageInputProps) {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      await sendMessage(taskId, { body: trimmed });
      setBody("");
      onSent?.();
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.status === 202) {
        addToast("Your message was flagged for review", "warning");
      } else {
        addToast(apiError.error ?? "Failed to send message", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <div className="flex-1">
        <Textarea
          id="message-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message..."
          rows={2}
        />
      </div>
      <Button type="submit" loading={loading} disabled={!body.trim()}>
        Send
      </Button>
    </form>
  );
}
