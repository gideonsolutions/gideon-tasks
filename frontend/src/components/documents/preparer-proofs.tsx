"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/hooks/use-auth";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils/format";
import { TAX_CREDENTIAL_LABELS } from "@/lib/constants";
import * as documentsApi from "@/lib/api/documents";
import { formatBytes, saveFile, uploadDocument } from "@/lib/documents/upload";
import { PROOF_KINDS, PROOF_KIND_LABELS } from "@/server/documents/rules";
import { TwoStepRequiredNotice } from "@/components/two-step/two-step-required";
import type { ApiError, PreparerProof, ProofKind, ProofStatus } from "@/lib/types";

const STATUS_LABELS: Record<ProofStatus, string> = {
  uploading: "Uploading",
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
  abandoned: "Upload didn't finish",
};

const STATUS_STYLES: Partial<Record<ProofStatus, string>> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

/**
 * A tasker sends proof of their PTIN (and, if they have one, their
 * credential) for an admin to review. Only they and admins can see the
 * files. Hidden when document storage isn't set up.
 */
export function PreparerProofs() {
  const { data: config, loading } = useApi(() => documentsApi.getDocumentsConfig(), []);
  if (loading && !config) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (!config?.enabled) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-700">
            Uploading proof isn&apos;t available yet. To have your PTIN
            recorded, follow the steps on{" "}
            <Link href="/tax-prep#preparers" className="text-blue-600 hover:underline">
              Tax Prep for preparers
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }
  return <ProofsCard maxBytes={config.max_file_bytes} accept={config.accept} retentionDays={config.proof_retention_days} />;
}

function ProofsCard({ maxBytes, accept, retentionDays }: { maxBytes: number; accept: string; retentionDays: number }) {
  const { addToast } = useToast();
  const { user, fetchUser } = useAuth();
  const { data: proofs, loading, error, refetch } = useApi(() => documentsApi.listMyProofs(), []);
  const [kind, setKind] = useState<ProofKind>("ptin");
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
        (meta) => documentsApi.startProofUpload(kind, meta),
        (started) => documentsApi.completeProofUpload(started.proof_id),
        setProgress,
      );
      addToast("Sent for review", "success");
      refetch();
    } catch (err) {
      addToast((err as ApiError).error ?? (err as Error).message ?? "Upload failed", "error");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function act(p: PreparerProof, what: "download" | "withdraw") {
    setBusy(p.id);
    try {
      if (what === "download") saveFile(await documentsApi.downloadMyProof(p.id), p.display_name ?? "document");
      else {
        await documentsApi.withdrawProof(p.id);
        addToast("Withdrawn, and the file deleted", "success");
        refetch();
      }
    } catch (err) {
      addToast((err as ApiError).error ?? "That didn't work", "error");
    } finally {
      setBusy(null);
      void fetchUser();
    }
  }

  if (error?.code === "two_step_required") {
    return <TwoStepRequiredNotice message={`To send proof of your PTIN or credential: ${error.error}.`} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proof of your PTIN and credential</CardTitle>
        <div className="mt-1 space-y-2 text-sm text-gray-700">
          <p>
            To take Tax Prep tasks, send proof of your current PTIN, such as
            the confirmation in your IRS Tax Pro Account or your PTIN letter.
            For IRS Notices &amp; Representation tasks, send proof of your
            credential: your enrollment card, your CPA license or your bar
            admission. An admin checks it and records your PTIN or credential.
          </p>
          <p>
            Only you and Gideon Tasks admins can see these files. Each file is
            deleted {retentionDays} days after an admin approves or rejects it.
            You can withdraw one, which deletes it, while it waits for review.
          </p>
          {user && (
            <p className="font-medium text-gray-900">
              On file now:{" "}
              {user.has_ptin && user.ptin_year ? `PTIN for ${user.ptin_year}` : "no PTIN"}
              {user.tax_credential ? `, ${TAX_CREDENTIAL_LABELS[user.tax_credential]}` : ""}.
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Select
            id="proof_kind"
            label="What this document proves"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProofKind)}
            options={PROOF_KINDS.map((k) => ({ value: k, label: PROOF_KIND_LABELS[k] }))}
          />
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
            Upload a document
          </Button>
          {progress !== null && <p className="text-xs text-gray-500">Uploading… {progress}%</p>}
          <p className="text-xs text-gray-600">
            PDF, JPEG, PNG or HEIC, up to {maxBytes / 1024 / 1024} MB. Cover
            your Social Security number if the document shows it.
          </p>
        </div>

        {loading && !proofs ? (
          <Spinner />
        ) : !proofs?.length ? (
          <p className="text-sm text-gray-500">You haven&apos;t sent any documents.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {proofs.map((p) => (
              <li key={p.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {p.display_name ?? "Deleted file"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {PROOF_KIND_LABELS[p.kind].split(" (")[0]} · {formatBytes(p.size_bytes)}
                      {p.uploaded_at && ` · sent ${formatDate(p.uploaded_at)}`}
                    </p>
                  </div>
                  <Badge className={STATUS_STYLES[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                </div>
                {p.review_note && <p className="text-sm text-gray-700">Note: {p.review_note}</p>}
                <p className="text-xs text-gray-500">
                  {p.file_deleted
                    ? "The file has been deleted."
                    : p.delete_after
                      ? `The file will be deleted on ${formatDate(p.delete_after)}.`
                      : ""}
                </p>
                {!p.file_deleted && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => act(p, "download")}>
                      Download
                    </Button>
                    {p.status === "pending" && (
                      <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => act(p, "withdraw")}>
                        Withdraw
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
