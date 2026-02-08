import type { Review } from "@/lib/types";
import { formatDate } from "@/lib/utils/format";
import { StarRating } from "@/components/ui/star-rating";

interface ReviewCardProps {
  review: Review;
}

export function ReviewCard({ review }: ReviewCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">Review</span>
        <span className="text-xs text-gray-500">
          {formatDate(review.created_at)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StarRating value={review.reliability} readonly size="sm" label="Reliability" />
        <StarRating value={review.quality} readonly size="sm" label="Quality" />
        <StarRating value={review.communication} readonly size="sm" label="Communication" />
        <StarRating value={review.integrity} readonly size="sm" label="Integrity" />
      </div>
      {review.comment && (
        <p className="text-sm text-gray-600">{review.comment}</p>
      )}
    </div>
  );
}
