"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import * as reviewsApi from "@/lib/api/reviews";
import type { ApiError } from "@/lib/types";

export default function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { addToast } = useToast();
  const [reliability, setReliability] = useState(0);
  const [quality, setQuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [integrity, setIntegrity] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if ([reliability, quality, communication, integrity].some((v) => v < 1 || v > 5)) {
      setError("All ratings must be between 1 and 5");
      return;
    }

    setLoading(true);
    try {
      await reviewsApi.createReview(id, {
        reliability,
        quality,
        communication,
        integrity,
        comment: comment || undefined,
      });
      addToast("Review submitted", "success");
      router.push(`/tasks/${id}`);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.error ?? "Failed to submit review");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Leave a Review</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <StarRating
              label="Reliability"
              value={reliability}
              onChange={setReliability}
            />
            <StarRating
              label="Quality"
              value={quality}
              onChange={setQuality}
            />
            <StarRating
              label="Communication"
              value={communication}
              onChange={setCommunication}
            />
            <StarRating
              label="Integrity"
              value={integrity}
              onChange={setIntegrity}
            />
            <Textarea
              id="comment"
              label="Comment (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience..."
            />
            <Button type="submit" loading={loading} className="w-full">
              Submit Review
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
