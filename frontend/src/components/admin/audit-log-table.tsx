"use client";

import { useState, useCallback } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { queryAuditLog } from "@/lib/api/admin";
import type { AuditLogEntry } from "@/lib/types";
import { Spinner } from "@/components/ui/spinner";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/utils/format";

const PER_PAGE = 20;

export function AuditLogTable() {
  const [page, setPage] = useState(1);

  const fetcher = useCallback(
    () =>
      queryAuditLog({
        page: String(page),
        per_page: String(PER_PAGE),
      }),
    [page],
  );

  const { data: entries, loading, error } = useApi<AuditLogEntry[]>(fetcher, [page]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load audit log: {error.error}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-500">No audit log entries</p>
      </div>
    );
  }

  const totalPages = entries.length < PER_PAGE ? page : page + 1;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Audit Log</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Actor ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Entity Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Entity ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Created At
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 font-mono">
                  {entry.actor_id ?? "system"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                  {entry.action}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                  {entry.entity_type}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 font-mono">
                  {entry.entity_id}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {formatDateTime(entry.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
