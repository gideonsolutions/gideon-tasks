"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import * as adminApi from "@/lib/api/admin";
import {
  IRS_PREPARER_DIRECTORY_URL,
  TAX_CREDENTIALS,
  TAX_CREDENTIAL_LABELS,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/utils/format";
import type {
  ApiError,
  TaxCredential,
  TaxPreparerChange,
  TaxPreparerRecord,
} from "@/lib/types";

const link = "text-blue-600 hover:underline";
const checkbox =
  "mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500";

/**
 * Records or clears a user's PTIN (for the current calendar year) and their
 * credential. No lookup is integrated: the admin checks the IRS directory
 * and, for a CPA, the state board, and records the result here. Only users
 * with a PTIN recorded for the current year can apply to, ask about or be
 * booked for Tax Prep tasks.
 */
export function TaxPreparerControl() {
  const { addToast } = useToast();
  const [userId, setUserId] = useState("");
  const [record, setRecord] = useState<TaxPreparerRecord | null>(null);
  const [loading, setLoading] = useState(false);

  const [ptin, setPtin] = useState("");
  const [ptinYear, setPtinYear] = useState<number | null>(null);
  const [ptinNote, setPtinNote] = useState("");
  const [ptinConfirmed, setPtinConfirmed] = useState(false);
  const [renewalConfirmed, setRenewalConfirmed] = useState(false);

  const [credential, setCredential] = useState<TaxCredential>("enrolled_agent");
  const [credentialNote, setCredentialNote] = useState("");
  const [credentialConfirmed, setCredentialConfirmed] = useState(false);

  function reset(next: TaxPreparerRecord | null) {
    setRecord(next);
    setPtin("");
    setPtinYear(next?.current_year ?? null);
    setPtinNote("");
    setPtinConfirmed(false);
    setRenewalConfirmed(false);
    setCredential(next?.tax_credential ?? "enrolled_agent");
    setCredentialNote("");
    setCredentialConfirmed(false);
  }

  async function lookUp() {
    setLoading(true);
    try {
      reset(await adminApi.getTaxPreparer(userId.trim()));
    } catch (err) {
      reset(null);
      addToast((err as ApiError).error ?? "Lookup failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function change(c: TaxPreparerChange, done: string) {
    if (!record) return;
    setLoading(true);
    try {
      reset(await adminApi.changeTaxPreparer(record.id, c));
      addToast(done, "success");
    } catch (err) {
      addToast((err as ApiError).error ?? "Action failed", "error");
    } finally {
      setLoading(false);
    }
  }

  const year = record?.current_year;
  const ptinCurrent = !!record?.ptin && record.ptin_year != null && record.ptin_year >= year!;
  const recordYear = ptinYear ?? year;
  const isNextYear = recordYear != null && year != null && recordYear > year;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax preparer: PTIN and credential</CardTitle>
        <div className="mt-1 space-y-2 text-sm text-gray-600">
          <p>
            Only users with a PTIN recorded for the current calendar year, or
            next year, can apply to, ask about or be booked for Tax Prep tasks.
            PTINs expire on December 31, and the IRS opens renewal for the next
            year in mid-October. From December 1 (New York time) you can record
            a renewed PTIN for next year, so the preparer isn&apos;t locked out
            on January 1; a record for this year lapses then (UTC). Clearing a
            PTIN stops new applications and bookings; it does not cancel tasks
            the user is already booked for.
          </p>
          <p>
            Record next year&apos;s PTIN early only for a renewal. A new PTIN
            applied for late in the year covers either this year or next, and
            one for next year isn&apos;t valid until January 1 (Form W-12
            instructions, line 2): record that one in January.
          </p>
          <p>
            <strong className="text-gray-900">Before you record:</strong> look
            the person up in the IRS{" "}
            <a href={IRS_PREPARER_DIRECTORY_URL} className={link}>
              Directory of Federal Tax Return Preparers with Credentials and
              Select Qualifications
            </a>
            . It lists, by name, city, state and ZIP code, enrolled agents,
            CPAs, attorneys and Annual Filing Season Program participants who
            have an active PTIN. It does not show PTINs, and the credentials in
            it are reported by the preparers. For a CPA, also check the state
            board of accountancy; for an attorney, the state bar. A preparer
            with no credential and no Annual Filing Season Program record is
            not in the directory. Say in the note what you checked.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              id="tax_preparer_user_id"
              label="User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user UUID"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!userId.trim()}
            loading={loading && !record}
            onClick={lookUp}
          >
            Look up
          </Button>
        </div>

        {record && (
          <div className="space-y-6">
            <div className="rounded-md border border-gray-200 p-3 text-sm text-gray-700 space-y-1">
              <p className="font-medium text-gray-900">
                {record.legal_first_name} {record.legal_last_name} ({record.email})
              </p>
              <p>Account: {record.status}</p>
            </div>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900">PTIN</h4>
              <div className="rounded-md border border-gray-200 p-3 text-sm text-gray-700 space-y-1">
                {record.ptin ? (
                  <>
                    <p>
                      {record.ptin}, recorded for {record.ptin_year}
                      {ptinCurrent ? " (current)" : ` (lapsed: it is now ${year})`}
                    </p>
                    {record.ptin_recorded_at && (
                      <p>
                        Recorded {formatDateTime(record.ptin_recorded_at)} by{" "}
                        <span className="font-mono">{record.ptin_recorded_by}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <p>No PTIN recorded</p>
                )}
                {record.ptin_note && (
                  <p className="text-gray-600">Note: {record.ptin_note}</p>
                )}
              </div>
              <Input
                id="ptin"
                label="PTIN (P and eight digits)"
                value={ptin}
                maxLength={9}
                onChange={(e) => setPtin(e.target.value)}
                placeholder="P12345678"
              />
              {record.recordable_years.length > 1 ? (
                <Select
                  id="ptin_year"
                  label="Year the PTIN is verified for"
                  value={String(recordYear)}
                  onChange={(e) => {
                    setPtinYear(Number(e.target.value));
                    setRenewalConfirmed(false);
                  }}
                  options={record.recordable_years.map((y) => ({
                    value: String(y),
                    label: y === year ? `${y} (this year)` : `${y} (next year, a renewal)`,
                  }))}
                />
              ) : (
                <p className="text-sm text-gray-700">
                  Year: {year}. Next year&apos;s PTIN can be recorded from
                  December 1.
                </p>
              )}
              <Textarea
                id="ptin_note"
                label={
                  record.ptin
                    ? "Note (what you checked, or why you are clearing it)"
                    : "Note (what you checked)"
                }
                value={ptinNote}
                maxLength={500}
                onChange={(e) => setPtinNote(e.target.value)}
              />
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className={checkbox}
                  checked={ptinConfirmed}
                  onChange={(e) => setPtinConfirmed(e.target.checked)}
                />
                <span>
                  I have confirmed that this PTIN is current for {recordYear} and
                  belongs to this person.
                </span>
              </label>
              {isNextYear && (
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className={checkbox}
                    checked={renewalConfirmed}
                    onChange={(e) => setRenewalConfirmed(e.target.checked)}
                  />
                  <span>
                    This is a renewal: the same PTIN is also active for {year}.
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={
                    !ptin.trim() ||
                    !ptinNote.trim() ||
                    !ptinConfirmed ||
                    (isNextYear && !renewalConfirmed)
                  }
                  loading={loading}
                  onClick={() =>
                    change(
                      {
                        action: "record_ptin",
                        ptin: ptin.trim(),
                        year: recordYear!,
                        note: ptinNote,
                        confirms_current_ptin: true,
                        ...(isNextYear && { confirms_renewal_active_this_year: true as const }),
                      },
                      `PTIN recorded for ${recordYear}`,
                    )
                  }
                >
                  Record PTIN for {recordYear}
                </Button>
                {record.ptin && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!ptinNote.trim()}
                    loading={loading}
                    onClick={() =>
                      change({ action: "clear_ptin", note: ptinNote }, "PTIN cleared")
                    }
                  >
                    Clear PTIN
                  </Button>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900">Credential</h4>
              <div className="rounded-md border border-gray-200 p-3 text-sm text-gray-700 space-y-1">
                {record.tax_credential ? (
                  <>
                    <p>{TAX_CREDENTIAL_LABELS[record.tax_credential]}</p>
                    {record.tax_credential_recorded_at && (
                      <p>
                        Recorded {formatDateTime(record.tax_credential_recorded_at)} by{" "}
                        <span className="font-mono">{record.tax_credential_recorded_by}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <p>No credential recorded</p>
                )}
                {record.tax_credential_note && (
                  <p className="text-gray-600">Note: {record.tax_credential_note}</p>
                )}
              </div>
              <Select
                id="tax_credential"
                label="Credential"
                value={credential}
                onChange={(e) => setCredential(e.target.value as TaxCredential)}
                options={TAX_CREDENTIALS.map((c) => ({
                  value: c,
                  label: TAX_CREDENTIAL_LABELS[c],
                }))}
              />
              <Textarea
                id="tax_credential_note"
                label={
                  record.tax_credential
                    ? "Note (where you checked it, e.g. the IRS directory or the state board, or why you are clearing it)"
                    : "Note (where you checked it, e.g. the IRS directory or the state board)"
                }
                value={credentialNote}
                maxLength={500}
                onChange={(e) => setCredentialNote(e.target.value)}
              />
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className={checkbox}
                  checked={credentialConfirmed}
                  onChange={(e) => setCredentialConfirmed(e.target.checked)}
                />
                <span>
                  I have confirmed that this credential is current and belongs
                  to this person.
                </span>
              </label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!credentialNote.trim() || !credentialConfirmed}
                  loading={loading}
                  onClick={() =>
                    change(
                      {
                        action: "record_credential",
                        credential,
                        note: credentialNote,
                        confirms_credential: true,
                      },
                      "Credential recorded",
                    )
                  }
                >
                  Record credential
                </Button>
                {record.tax_credential && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!credentialNote.trim()}
                    loading={loading}
                    onClick={() =>
                      change(
                        { action: "clear_credential", note: credentialNote },
                        "Credential cleared",
                      )
                    }
                  >
                    Clear credential
                  </Button>
                )}
              </div>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
