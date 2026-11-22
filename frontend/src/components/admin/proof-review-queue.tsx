"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/utils/format";
import { IRS_PREPARER_DIRECTORY_URL, TAX_CREDENTIAL_LABELS } from "@/lib/constants";
import * as adminApi from "@/lib/api/admin";
import * as documentsApi from "@/lib/api/documents";
import { formatBytes, openFile } from "@/lib/documents/upload";
import { PROOF_KIND_LABELS } from "@/server/documents/rules";
import type { ApiError, ProofQueueItem, TaxCredential } from "@/lib/types";

const checkbox = "mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500";

/**
 * Proof documents waiting for review. The admin opens one, then records the
 * PTIN (with its year) or the credential with the same record action as the
 * Tax preparer card on /admin/users, which marks the document approved; or
 * rejects it with a note the tasker sees. Opening a document is audited.
 */
export function ProofReviewQueue() {
  const { data: config } = useApi(() => documentsApi.getDocumentsConfig(), []);
  const { data, loading, error, refetch } = useApi(
    () => (config?.enabled ? documentsApi.getProofQueue() : Promise.resolve(null)),
    [config?.enabled],
  );

  if (config && !config.enabled) {
    return (
      <p className="text-sm text-gray-700">
        Document storage isn&apos;t set up, so there is nothing to review.
      </p>
    );
  }
  if (loading || !data) {
    return error ? (
      <p className="text-sm text-red-700">{error.error}</p>
    ) : (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-gray-700">
        Open each document and check it against the IRS{" "}
        <a href={IRS_PREPARER_DIRECTORY_URL} className="text-blue-600 hover:underline">
          Directory of Federal Tax Return Preparers with Credentials and Select
          Qualifications
        </a>{" "}
        and, for a CPA, the state board of accountancy (for an attorney, the
        state bar). Files are deleted {config?.proof_retention_days ?? 90} days
        after you decide.
      </p>
      {data.proofs.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-center text-gray-500">Nothing is waiting for review.</p>
          </CardContent>
        </Card>
      ) : (
        data.proofs.map((p) => (
          <ProofItem
            key={p.id}
            proof={p}
            currentYear={data.current_year}
            recordableYears={data.recordable_years}
            onDone={refetch}
          />
        ))
      )}
    </div>
  );
}

function ProofItem({
  proof,
  currentYear,
  recordableYears,
  onDone,
}: {
  proof: ProofQueueItem;
  currentYear: number;
  recordableYears: number[];
  onDone: () => void;
}) {
  const { addToast } = useToast();
  const [ptin, setPtin] = useState("");
  const [year, setYear] = useState(currentYear);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [renewal, setRenewal] = useState(false);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const isPtin = proof.kind === "ptin";
  const nextYear = isPtin && year > currentYear;

  async function open() {
    setBusy(true);
    try {
      openFile(await documentsApi.openProofAsAdmin(proof.id));
      setOpened(true);
    } catch (err) {
      addToast((err as ApiError).error ?? "Could not open the document", "error");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      if (isPtin) {
        await adminApi.changeTaxPreparer(proof.user.id, {
          action: "record_ptin",
          ptin: ptin.trim(),
          year,
          note,
          confirms_current_ptin: true,
          ...(nextYear && { confirms_renewal_active_this_year: true as const }),
          proof_id: proof.id,
        });
      } else {
        await adminApi.changeTaxPreparer(proof.user.id, {
          action: "record_credential",
          credential: proof.kind as TaxCredential,
          note,
          confirms_credential: true,
          proof_id: proof.id,
        });
      }
      addToast("Recorded, and the document approved", "success");
      onDone();
    } catch (err) {
      addToast((err as ApiError).error ?? "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await documentsApi.rejectProof(proof.id, note);
      addToast("Rejected", "success");
      onDone();
    } catch (err) {
      addToast((err as ApiError).error ?? "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const credentialLabel = isPtin ? null : TAX_CREDENTIAL_LABELS[proof.kind as TaxCredential];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{PROOF_KIND_LABELS[proof.kind].split(" (")[0]}</CardTitle>
        <div className="mt-1 text-sm text-gray-700 space-y-1">
          <p>
            {proof.user.legal_first_name} {proof.user.legal_last_name} ({proof.user.email}) · account{" "}
            {proof.user.status} · <span className="font-mono text-xs">{proof.user.id}</span>
          </p>
          <p>
            On file: {proof.user.ptin_year ? `PTIN for ${proof.user.ptin_year}` : "no PTIN"}
            {proof.user.tax_credential
              ? `, ${TAX_CREDENTIAL_LABELS[proof.user.tax_credential]}`
              : ""}
          </p>
          <p className="text-gray-600">
            {proof.display_name} · {formatBytes(proof.size_bytes)}
            {proof.uploaded_at && ` · sent ${formatDateTime(proof.uploaded_at)}`}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" variant="secondary" loading={busy && !opened} disabled={busy} onClick={open}>
          Open the document
        </Button>
        {isPtin && (
          <>
            <Input
              id={`ptin-${proof.id}`}
              label="PTIN shown on the document (P and eight digits)"
              value={ptin}
              maxLength={9}
              onChange={(e) => setPtin(e.target.value)}
              placeholder="P12345678"
            />
            {recordableYears.length > 1 && (
              <Select
                id={`year-${proof.id}`}
                label="Year the PTIN is verified for"
                value={String(year)}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  setRenewal(false);
                }}
                options={recordableYears.map((y) => ({
                  value: String(y),
                  label: y === currentYear ? `${y} (this year)` : `${y} (next year, a renewal)`,
                }))}
              />
            )}
          </>
        )}
        <Textarea
          id={`note-${proof.id}`}
          label="Note (to approve: what you checked; to reject: shown to the tasker, say what to send instead)"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className={checkbox} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>
            {isPtin
              ? `I have opened the document and confirmed that this PTIN is current for ${year} and belongs to this person.`
              : `I have opened the document and confirmed that this ${credentialLabel} credential is current and belongs to this person.`}
          </span>
        </label>
        {nextYear && (
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className={checkbox} checked={renewal} onChange={(e) => setRenewal(e.target.checked)} />
            <span>This is a renewal: the same PTIN is also active for {currentYear}.</span>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={busy}
            disabled={!opened || !note.trim() || !confirmed || (isPtin && !ptin.trim()) || (nextYear && !renewal)}
            onClick={approve}
          >
            {isPtin ? `Record PTIN for ${year} and approve` : `Record ${credentialLabel} and approve`}
          </Button>
          <Button size="sm" variant="danger" disabled={busy || !note.trim()} onClick={reject}>
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
