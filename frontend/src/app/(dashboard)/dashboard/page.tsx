"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import { TaskList } from "@/components/tasks/task-list";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { TRUST_LEVEL_NAMES, GIDEON_FEE_BPS } from "@/lib/constants";
import { calculateFees } from "@/lib/utils/fees";
import { formatCents } from "@/lib/utils/format";
import type { Task } from "@/lib/types";
import * as usersApi from "@/lib/api/users";
import * as categoriesApi from "@/lib/api/categories";

const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "pending_review",
  "published",
  "assigned",
  "in_progress",
  "submitted",
  "disputed",
]);

function sumTotalCharged(tasks: Task[], feeBps: number): number {
  return tasks.reduce(
    (acc, t) =>
      acc + calculateFees(t.price_cents, t.pricing_mode, feeBps).total_charged_cents,
    0,
  );
}

function sumDoerPayout(tasks: Task[], feeBps: number): number {
  return tasks.reduce(
    (acc, t) =>
      acc + calculateFees(t.price_cents, t.pricing_mode, feeBps).doer_payout_cents,
    0,
  );
}

export default function DashboardPage() {
  const { user, trustLevel } = useAuth();
  const [feeBps, setFeeBps] = useState(GIDEON_FEE_BPS);

  useEffect(() => {
    categoriesApi
      .getCurrentFee()
      .then((res) => setFeeBps(res.fee_bps))
      .catch(() => {});
  }, []);

  const { data, loading } = useApi(() => usersApi.getMyTasks(), []);
  const posted = data?.posted ?? [];
  const doing = data?.doing ?? [];

  const activePosted = posted.filter((t) => ACTIVE_STATUSES.has(t.status));
  const activeDoing = doing.filter((t) => ACTIVE_STATUSES.has(t.status));

  const totalActiveCost = sumTotalCharged(activePosted, feeBps);
  const totalActiveEarnings = sumDoerPayout(activeDoing, feeBps);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Welcome back, {user?.legal_first_name}. Trust Level:{" "}
          <span className="font-medium">{TRUST_LEVEL_NAMES[trustLevel] ?? "Unknown"}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Tasks Posted</p>
            <p className="text-2xl font-bold">{posted.length}</p>
            {activePosted.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">{activePosted.length} active</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Active task cost</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCents(totalActiveCost)}
            </p>
            <p className="text-xs text-gray-500 mt-1">across {activePosted.length} task(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Tasks I&apos;m Doing</p>
            <p className="text-2xl font-bold">{doing.length}</p>
            {activeDoing.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">{activeDoing.length} active</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Active earnings</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCents(totalActiveEarnings)}
            </p>
            <p className="text-xs text-gray-500 mt-1">expected payout</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">My Posted Tasks</h2>
            <TaskList tasks={posted} emptyMessage="You haven't posted any tasks yet." />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Tasks I&apos;m Working On</h2>
            <TaskList tasks={doing} emptyMessage="You aren't assigned to any tasks." />
          </div>
        </>
      )}
    </div>
  );
}
