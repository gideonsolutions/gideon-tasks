"use client";

import { use, useState } from "react";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { formatRelative } from "@/lib/utils/format";
import { clsx } from "clsx";
import * as messagesApi from "@/lib/api/messages";
import type { ApiError } from "@/lib/types";

export default function TaskMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const { addToast } = useToast();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const { data: messages, loading, refetch } = useApi(
    () => messagesApi.listMessages(id),
    [id],
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await messagesApi.sendMessage(id, { body });
      setBody("");
      refetch();
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.status === 202) {
        addToast("Message flagged for review", "warning");
      } else {
        addToast(apiError.error ?? "Failed to send", "error");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Messages</h1>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto border border-gray-200 rounded-md p-4">
          {!messages?.length ? (
            <p className="text-gray-500 text-center py-4">No messages yet.</p>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.sender_id === user?.id;
              return (
                <div
                  key={msg.id}
                  className={clsx("flex", isOwn ? "justify-end" : "justify-start")}
                >
                  <div
                    className={clsx(
                      "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                      isOwn
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-900",
                    )}
                  >
                    <p>{msg.body}</p>
                    <p
                      className={clsx(
                        "text-xs mt-1",
                        isOwn ? "text-blue-200" : "text-gray-400",
                      )}
                    >
                      {formatRelative(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message..."
          className="flex-1"
          rows={2}
        />
        <Button type="submit" loading={sending} className="self-end">
          Send
        </Button>
      </form>
    </div>
  );
}
