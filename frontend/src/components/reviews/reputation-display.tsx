import type { ReputationSummary } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";

interface ReputationDisplayProps {
  reputation: ReputationSummary;
}

export function ReputationDisplay({ reputation }: ReputationDisplayProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reputation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <StatItem label="Tasks Completed" value={reputation.total_completed} />
          <StatItem
            label="Completion Rate"
            value={`${(reputation.completion_rate * 100).toFixed(0)}%`}
          />
          <StatItem
            label="On-Time Rate"
            value={`${(reputation.on_time_rate * 100).toFixed(0)}%`}
          />
          <StatItem
            label="Positive Reviews"
            value={`${(reputation.positive_review_rate * 100).toFixed(0)}%`}
          />
          <StatItem label="Disputes Lost" value={reputation.disputes_lost} />
        </div>
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Average Ratings</h4>
          <div className="grid grid-cols-2 gap-3">
            <StarRating
              value={Math.round(reputation.avg_reliability)}
              readonly
              size="sm"
              label={`Reliability (${reputation.avg_reliability.toFixed(1)})`}
            />
            <StarRating
              value={Math.round(reputation.avg_quality)}
              readonly
              size="sm"
              label={`Quality (${reputation.avg_quality.toFixed(1)})`}
            />
            <StarRating
              value={Math.round(reputation.avg_communication)}
              readonly
              size="sm"
              label={`Communication (${reputation.avg_communication.toFixed(1)})`}
            />
            <StarRating
              value={Math.round(reputation.avg_integrity)}
              readonly
              size="sm"
              label={`Integrity (${reputation.avg_integrity.toFixed(1)})`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
