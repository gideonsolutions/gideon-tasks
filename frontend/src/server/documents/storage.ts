import "server-only";
import { NextResponse } from "next/server";
import { BlobNotFoundError, del, get, head } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { notFound } from "../errors";
import {
  BLOB_CACHE_MAX_AGE_SECS,
  MAX_DOCUMENT_BYTES,
  UPLOAD_TOKEN_TTL_MS,
  type DocumentContentType,
} from "./rules";

// The one place that talks to Vercel Blob. The store must be PRIVATE, and
// the project needs BLOB_READ_WRITE_TOKEN: the SDK signs browser upload
// tokens only with a read-write token (OIDC isn't accepted for that), so the
// same token is passed to every call. Without it, document storage is off:
// the routes answer 404 and the pages hide it.

/** Whether document storage is set up (BLOB_READ_WRITE_TOKEN is present). */
export function documentsEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Throws 404 when document storage isn't set up. */
export function requireDocumentsEnabled(): void {
  if (!documentsEnabled()) throw notFound("Document uploads are not available");
}

function token(): string {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) throw notFound("Document uploads are not available");
  return t;
}

/**
 * A token the browser uses to upload one file straight to the store. It is
 * signed with the read-write token and can only write this exact pathname,
 * once (no overwrite), with this content type, up to the size limit, for
 * UPLOAD_TOKEN_TTL_MS. The server only issues it after checking who is asking.
 */
export async function issueUploadToken(
  pathname: string,
  contentType: DocumentContentType,
  now: Date = new Date(),
): Promise<{ clientToken: string; validUntil: number }> {
  const validUntil = now.getTime() + UPLOAD_TOKEN_TTL_MS;
  const clientToken = await generateClientTokenFromReadWriteToken({
    token: token(),
    pathname,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_DOCUMENT_BYTES,
    validUntil,
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: BLOB_CACHE_MAX_AGE_SECS,
  });
  return { clientToken, validUntil };
}

/** The stored file's size and type, or null if nothing was uploaded there. */
export async function blobInfo(pathname: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const h = await head(pathname, { token: token() });
    return { size: h.size, contentType: h.contentType };
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
}

/** The file's first bytes (up to `n`), to check its type. */
export async function blobFirstBytes(pathname: string, n = 32): Promise<Uint8Array> {
  const r = await get(pathname, { access: "private", token: token(), useCache: false });
  if (!r || r.statusCode !== 200) return new Uint8Array();
  const reader = r.stream.getReader();
  const out = new Uint8Array(n);
  let filled = 0;
  try {
    while (filled < n) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const take = Math.min(value.length, n - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out.subarray(0, filled);
}

/** The file as a stream, straight from the store (not the CDN cache), or null if it is gone. */
export async function blobStream(
  pathname: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number } | null> {
  const r = await get(pathname, { access: "private", token: token(), useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return { stream: r.stream, contentType: r.blob.contentType, size: r.blob.size };
}

/** Deletes the file. Deleting one that is already gone succeeds. */
export async function deleteBlob(pathname: string): Promise<void> {
  await del(pathname, { token: token() });
}

/**
 * The response for a download: the file as an attachment, never cached by a
 * shared cache, and never sniffed into another type.
 */
export function downloadResponse(
  file: { stream: ReadableStream<Uint8Array>; contentType: string; size: number },
  displayName: string,
): NextResponse {
  const ascii = displayName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(displayName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
