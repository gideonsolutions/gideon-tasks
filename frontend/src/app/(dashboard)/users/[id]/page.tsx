"use client";

import { use } from "react";
import { useApi } from "@/lib/hooks/use-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/star-rating";
import { Spinner } from "@/components/ui/spinner";
import { TRUST_LEVEL_NAMES } from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";
import * as usersApi from "@/lib/api/users";
import * as reviewsApi from "@/lib/api/reviews";

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: profile, loading } = useApi(
    () => usersApi.getUserProfile(id),
    [id],
  );
  const { data: reviews } = useApi(
    () => reviewsApi.listUserReviews(id),
    [id],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-700">
        User not found
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{profile.legal_first_name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Trust Level:</span>
            <Badge className="bg-blue-100 text-blue-700">
              {TRUST_LEVEL_NAMES[profile.trust_level] ?? "Unknown"}
            </Badge>
          </div>
          <div>
            <span className="text-sm text-gray-500">Member since:</span>{" "}
            <span>{formatDate(profile.created_at)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reviews ({reviews?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!reviews?.length ? (
            <p className="text-gray-500">No reviews yet.</p>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="border-b border-gray-100 pb-4 last:border-0"
                >
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <StarRating
                      label="Reliability"
                      value={review.reliability}
                      size="sm"
                      readonly
                    />
                    <StarRating
                      label="Quality"
                      value={review.quality}
                      size="sm"
                      readonly
                    />
                    <StarRating
                      label="Communication"
                      value={review.communication}
                      size="sm"
                      readonly
                    />
                    <StarRating
                      label="Integrity"
                      value={review.integrity}
                      size="sm"
                      readonly
                    />
                  </div>
                  {review.comment && (
                    <p className="text-sm text-gray-700">{review.comment}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(review.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
