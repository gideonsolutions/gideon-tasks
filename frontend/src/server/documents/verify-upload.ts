import "server-only";
import { blobFirstBytes, blobInfo, deleteBlob } from "./storage";
import { isDocumentContentType, MAX_DOCUMENT_BYTES, sniffMatches } from "./rules";

export type UploadCheck =
  | { ok: true; size: number }
  | { ok: false; reason: "missing"; message: string }
  | { ok: false; reason: "invalid"; message: string };

/**
 * Checks a file the browser says it has uploaded: it is in the store, within
 * the size limit, of the type the upload token allowed, and its first bytes
 * match that type. An invalid file is deleted from the store here; the caller
 * records that.
 */
export async function verifyUploadedFile(f: {
  pathname: string;
  content_type: string;
}): Promise<UploadCheck> {
  const info = await blobInfo(f.pathname);
  if (!info) return { ok: false, reason: "missing", message: "The file hasn't arrived" };

  let problem: string | null = null;
  if (info.size > MAX_DOCUMENT_BYTES) problem = "The file is larger than the limit";
  else if (info.contentType !== f.content_type || !isDocumentContentType(f.content_type)) {
    problem = "The file's type doesn't match what was declared";
  } else if (!sniffMatches(f.content_type, await blobFirstBytes(f.pathname))) {
    problem = "The file isn't a real PDF, JPEG, PNG or HEIC file";
  }
  if (problem) {
    await deleteBlob(f.pathname);
    return { ok: false, reason: "invalid", message: `${problem}, so it was deleted` };
  }
  return { ok: true, size: info.size };
}
