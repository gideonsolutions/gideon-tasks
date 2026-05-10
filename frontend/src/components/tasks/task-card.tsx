"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Task } from "@/lib/types";
import { TaskStatusBadge } from "./task-status-badge";
import { formatCents, formatDate, formatRelative } from "@/lib/utils/format";
import { calculateFees } from "@/lib/utils/fees";
import { GIDEON_FEE_BPS } from "@/lib/constants";
import * as categoriesApi from "@/lib/api/categories";

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const [feeBps, setFeeBps] = useState(GIDEON_FEE_BPS);
  useEffect(() => {
    categoriesApi
      .getCurrentFee()
      .then((res) => setFeeBps(res.fee_bps))
      .catch(() => {});
  }, []);

  const fees = calculateFees(task.price_cents, task.pricing_mode, feeBps);

  return (
    <Link href={`/tasks/${task.id}`} className="block">
      <div className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium text-gray-900 line-clamp-1">{task.title}</h3>
          <TaskStatusBadge status={task.status} />
        </div>
        <p className="text-sm text-gray-600 line-clamp-2 mb-3">{task.description}</p>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-baseline gap-3">
            <span className="font-semibold text-green-600">
              {formatCents(fees.doer_payout_cents)}{" "}
              <span className="text-xs font-normal text-gray-500">to doer</span>
            </span>
            <span className="text-xs text-gray-500">
              ({formatCents(fees.total_charged_cents)} total)
            </span>
          </div>
          <div className="flex items-center gap-3 text-gray-500">
            <span>{task.location_type === "remote" ? "Remote" : "In Person"}</span>
            <span>Due {formatDate(task.deadline)}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Posted {formatRelative(task.created_at)}
        </p>
      </div>
    </Link>
  );
}
