"use client";

import { clsx } from "clsx";
import type { TaskMessage } from "@/lib/types";
import { formatRelative } from "@/lib/utils/format";

interface MessageListProps {
  messages: TaskMessage[];
  currentUserId: string;
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-500">No messages yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isOwn = message.sender_id === currentUserId;
        return (
          <div
            key={message.id}
            className={clsx("flex", isOwn ? "justify-end" : "justify-start")}
          >
            <div
              className={clsx(
                "max-w-[75%] rounded-lg px-4 py-2",
                isOwn
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-900",
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{message.body}</p>
              <p
                className={clsx(
                  "mt-1 text-xs",
                  isOwn ? "text-blue-200" : "text-gray-500",
                )}
              >
                {formatRelative(message.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
