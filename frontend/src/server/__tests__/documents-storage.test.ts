import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPayloadFromClientToken } from "@vercel/blob/client";
import {
  documentsEnabled,
  downloadResponse,
  issueUploadToken,
  requireDocumentsEnabled,
} from "../documents/storage";
import { AppError } from "../errors";

// The upload token is signed by the real SDK with a made-up read-write token
// (no network): these tests read back what it allows.

const FAKE_RW_TOKEN = "vercel_blob_rw_teststore0001_notarealsecret";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = FAKE_RW_TOKEN;
});
afterEach(() => {
  if (saved === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = saved;
});

describe("documentsEnabled", () => {
  it("is on only with BLOB_READ_WRITE_TOKEN", () => {
    expect(documentsEnabled()).toBe(true);
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(documentsEnabled()).toBe(false);
    const err = (() => {
      try {
        requireDocumentsEnabled();
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(404);
  });
});

describe("issueUploadToken: the token's scope", () => {
  it("allows one pathname, one type, 20 MB, no overwrite, for 15 minutes", async () => {
    const now = new Date("2026-11-21T15:00:00Z");
    const pathname = "tasks/0190d0c0-0000-7000-8000-0000000000b1/0190d0c0-0000-7000-8000-0000000000d1.pdf";
    const { clientToken, validUntil } = await issueUploadToken(pathname, "application/pdf", now);

    expect(clientToken.startsWith("vercel_blob_client_teststore0001_")).toBe(true);
    expect(validUntil).toBe(now.getTime() + 15 * 60 * 1000);
    const payload = getPayloadFromClientToken(clientToken);
    expect(payload).toMatchObject({
      pathname,
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: 20 * 1024 * 1024,
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
    });
    // The read-write token itself is never in it.
    expect(clientToken).not.toContain("notarealsecret");
    expect(JSON.stringify(payload)).not.toContain("notarealsecret");
  });

  it("can't be issued without storage set up", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await expect(issueUploadToken("tasks/a/b.pdf", "application/pdf")).rejects.toBeInstanceOf(AppError);
  });
});

describe("downloadResponse", () => {
  it("sends an attachment that no shared cache keeps and no browser sniffs", async () => {
    const stream = new Blob(["%PDF-1.7"]).stream();
    const res = downloadResponse(
      { stream, contentType: "application/pdf", size: 8 },
      "Kitty Cats W-2 2025 é.pdf",
    );
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="Kitty Cats W-2 2025 _.pdf"; filename*=UTF-8''Kitty%20Cats%20W-2%202025%20%C3%A9.pdf`,
    );
    expect(await res.text()).toBe("%PDF-1.7");
  });
});
