import { FEE_SCHEDULE } from "@/lib/constants";

function formatMillions(cents: number | null): string {
  if (cents === null) return "—";
  const millions = cents / 100_000_000;
  return `$${millions}M`;
}

export function FeeScheduleTable() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Gideon Fee Schedule</h2>
      <p className="mt-1 text-sm text-gray-600">
        The platform fee steps down as cumulative volume grows. The rate at the
        time of escrow is the rate applied — never higher than what you see
        here.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4 font-medium">Total Platform Volume</th>
              <th className="py-2 pr-4 font-medium">Gideon Fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {FEE_SCHEDULE.map((tier) => {
              const from = formatMillions(tier.volumeFromCents);
              const to = tier.volumeToCents
                ? formatMillions(tier.volumeToCents)
                : null;
              const range =
                tier.volumeFromCents === 0
                  ? `Less than ${to}`
                  : to
                    ? `${from} – ${to}`
                    : `${from}+`;
              return (
                <tr key={tier.bps} className="text-gray-700">
                  <td className="py-2 pr-4">{range}</td>
                  <td className="py-2 pr-4 font-medium">
                    {(tier.bps / 100).toFixed(tier.bps % 100 === 0 ? 0 : 1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
