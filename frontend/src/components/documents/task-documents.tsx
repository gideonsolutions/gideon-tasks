"use client";

import { useRef, useState } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import * as documentsApi from "@/lib/api/documents";
import { formatBytes, saveFile, uploadDocument } from "@/lib/documents/upload";
import { DOCUMENT_CATEGORY_SLUGS } from "@/server/documents/rules";
import type { ApiError, Task } from "@/lib/types";

const VISIBLE_STATUSES = ["assigned", "in_progress", "submitted", "disputed", "completed", "cancelled", "resolved"];

/**
 * The files on a Tax Prep or IRS Notices & Representation task, for the
 * requester and the assigned tasker (and an admin while a dispute is open).
 * Hidden when document storage isn't set up, and on every other task.
 */
export function TaskDocuments({ task }: { task: Task }) {
  const { user, isAdmin } = useAuth();
  const isParticipant = !!user && (user.id === task.requester_id || user.id === task.assigned_doer_id);
  const mayLook =
    DOCUMENT_CATEGORY_SLUGS.includes(task.category_slug ?? "") &&
    !!task.assigned_doer_id &&
    VISIBLE_STATUSES.includes(task.status) &&
    (isParticipant || (isAdmin && task.status === "disputed"));

  const { data: config } = useApi(
    () => (mayLook ? documentsApi.getDocumentsConfig() : Promise.resolve(null)),
    [mayLook],
  );
  if (!mayLook || !config?.enabled) return null;
  return (
    <TaskDocumentsCard
      task={task}
      maxBytes={config.max_file_bytes}
      accept={config.accept}
      retentionDays={config.task_retention_days}
    />
  );
}

function TaskDocumentsCard({
  task,
  maxBytes,
  accept,
  retentionDays,
}: {
  task: Task;
  maxBytes: number;
  accept: string;
  retentionDays: number;
}) {
  const { addToast } = useToast();
  const { data, loading, error, refetch } = useApi(() => documentsApi.listTaskDocuments(task.id), [task.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (file.size > maxBytes) {
      addToast(`Files can be up to ${maxBytes / 1024 / 1024} MB`, "error");
      return;
    }
    setBusy("upload");
    setProgress(0);
    try {
      await uploadDocument(
        file,
        (meta) => documentsApi.startTaskUpload(task.id, meta),
        (started) => documentsApi.completeTaskUpload(task.id, started.document_id),
        setProgress,
      );
      addToast("File uploaded", "success");
    } catch (err) {
      addToast((err as ApiError).error ?? (err as Error).message ?? "Upload failed", "error");
      setBusy(null);
      setProgress(null);
      return;
    }
    setBusy(null);
    setProgress(null);
    refetch();
  }

  async function download(id: string, name: string | null) {
    setBusy(id);
    try {
      saveFile(await documentsApi.downloadTaskDocument(task.id, id), name ?? "document");
    } catch (err) {
      addToast((err as ApiError).error ?? "Download failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await documentsApi.deleteTaskDocument(task.id, id);
      addToast("File deleted", "success");
      refetch();
    } catch (err) {
      addToast((err as ApiError).error ?? "Delete failed", "error");
    } finally {
      setBusy(null);
    }
  }

  if (error) return null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Documents</h3>
        <p className="mt-1 text-sm text-gray-700">
          Only you and the other person on this task can see these files.
          Admins can open them only while a dispute is open, and every time
          they do is recorded. All files are deleted {retentionDays} days
          after the task is completed, cancelled or resolved.
        </p>
        {data?.delete_after && (
          <p className="mt-1 text-sm font-medium text-gray-900">
            These files will be deleted on {formatDate(data.delete_after)}.
          </p>
        )}
        {data?.access === "admin_dispute" && (
          <p className="mt-1 text-sm font-medium text-amber-800">
            You are viewing these as an admin because a dispute is open. This
            is recorded in the audit log.
          </p>
        )}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : !data?.documents.length ? (
        <p className="text-sm text-gray-500">No files yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{d.display_name}</p>
                <p className="text-xs text-gray-500">
                  {d.mine ? "You" : "The other person"} · {formatBytes(d.size_bytes)}
                  {d.uploaded_at && ` · ${formatDateTime(d.uploaded_at)}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === d.id}
                  disabled={busy !== null && busy !== d.id}
                  onClick={() => download(d.id, d.display_name)}
                >
                  Download
                </Button>
                {d.mine && data.access === "participant" && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy !== null}
                    onClick={() => remove(d.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {data?.can_upload && (
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <input
            ref={input}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <Button size="sm" loading={busy === "upload"} disabled={busy !== null} onClick={() => input.current?.click()}>
            Upload a file
          </Button>
          {progress !== null && <p className="text-xs text-gray-500">Uploading… {progress}%</p>}
          <p className="text-xs text-gray-600">
            PDF, JPEG, PNG or HEIC, up to {maxBytes / 1024 / 1024} MB each.
          </p>
        </div>
      )}
    </section>
  );
}
