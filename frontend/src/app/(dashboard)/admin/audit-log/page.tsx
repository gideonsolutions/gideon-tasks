"use client";

import { useApi } from "@/lib/hooks/use-api";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/utils/format";
import * as adminApi from "@/lib/api/admin";

export default function AuditLogPage() {
  const { data: entries, loading } = useApi(
    () => adminApi.queryAuditLog(),
    [],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Actor
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Action
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Entity
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Entity ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {entries?.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3 text-sm text-gray-700">
                {entry.actor_id?.slice(0, 8) ?? "System"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">{entry.action}</td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {entry.entity_type}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                {entry.entity_id.slice(0, 8)}...
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {formatDateTime(entry.created_at)}
              </td>
            </tr>
          )) ?? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                No audit log entries.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
