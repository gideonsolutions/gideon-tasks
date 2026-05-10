"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FEE_SCHEDULE, feeBpsForVolume } from "@/lib/constants";
import { formatCentsCompact } from "@/lib/utils/format";
import * as categoriesApi from "@/lib/api/categories";

function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

interface VolumeProgressProps {
  /** When true, omit the "See full schedule" link (used on the /fees page itself). */
  hideScheduleLink?: boolean;
}

export function VolumeProgress({ hideScheduleLink = false }: VolumeProgressProps = {}) {
  const [volume, setVolume] = useState<number | null>(null);

  useEffect(() => {
    categoriesApi
      .getCurrentFee()
      .then((res) => setVolume(res.platform_volume_cents))
      .catch(() => setVolume(0));
  }, []);

  if (volume === null) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6 animate-pulse">
        <div className="h-5 w-48 bg-gray-200 rounded" />
        <div className="mt-4 h-2 bg-gray-200 rounded" />
      </section>
    );
  }

  const currentBps = feeBpsForVolume(volume);
  const currentTier = FEE_SCHEDULE.find((t) => t.bps === currentBps);
  const nextTier = currentTier?.volumeToCents
    ? FEE_SCHEDULE.find(
        (t) => t.volumeFromCents === currentTier.volumeToCents,
      )
    : null;

  const tierStart = currentTier?.volumeFromCents ?? 0;
  const tierEnd = currentTier?.volumeToCents ?? null;
  const progressRatio = tierEnd
    ? Math.min(1, (volume - tierStart) / (tierEnd - tierStart))
    : 1;
  const progressPct = (progressRatio * 100).toFixed(1);

  const remainingCents = tierEnd ? tierEnd - volume : 0;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Platform progress
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Cumulative escrowed task volume — drives the active fee tier.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {formatCentsCompact(volume)}
          </div>
          <div className="text-xs text-gray-500">
            current fee {bpsToPercent(currentBps)}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          <span>{formatCentsCompact(tierStart)}</span>
          <span>{tierEnd ? formatCentsCompact(tierEnd) : "—"}</span>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-4 text-sm">
        <div className="text-gray-700">
          {nextTier && tierEnd ? (
            <>
              <span className="font-medium">
                {formatCentsCompact(remainingCents)}
              </span>{" "}
              until the fee drops to{" "}
              <span className="font-medium">{bpsToPercent(nextTier.bps)}</span>.
            </>
          ) : (
            <>Lowest published fee tier reached.</>
          )}
        </div>
        {!hideScheduleLink && (
          <Link
            href="/fees"
            className="text-sm text-blue-600 hover:underline whitespace-nowrap"
          >
            See full schedule →
          </Link>
        )}
      </div>
    </section>
  );
}
