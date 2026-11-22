"use client";

import { put } from "@vercel/blob/client";
import { contentTypeForName, isDocumentContentType } from "@/server/documents/rules";
import type { UploadStart } from "@/lib/types";
import type { FileMetaRequest } from "@/lib/api/documents";

/**
 * What to tell the server about a file. Some browsers give HEIC files no
 * type, so the type comes from the extension when the browser's isn't one
 * of ours. The server checks it again, and checks the file's bytes after.
 */
export function fileMeta(file: File): FileMetaRequest {
  const type = isDocumentContentType(file.type) ? file.type : (contentTypeForName(file.name) ?? file.type);
  return { file_name: file.name, content_type: type, size_bytes: file.size };
}

/**
 * Uploads one file: the server records it and issues a token for one
 * pathname (start), the browser sends the file straight to the private
 * store, and the server checks what arrived (complete).
 */
export async function uploadDocument<S extends UploadStart, T>(
  file: File,
  start: (meta: FileMetaRequest) => Promise<S>,
  complete: (started: S) => Promise<T>,
  onProgress?: (percent: number) => void,
): Promise<T> {
  const meta = fileMeta(file);
  const s = await start(meta);
  await put(s.pathname, file, {
    access: "private",
    token: s.client_token,
    contentType: s.content_type,
    multipart: file.size > 5 * 1024 * 1024,
    onUploadProgress: onProgress ? (e) => onProgress(Math.round(e.percentage)) : undefined,
  });
  return complete(s);
}

/** Saves a downloaded file under its name, then forgets it. */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens a downloaded file in a new tab (PDFs and images display there), then forgets it. */
export function openFile(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
