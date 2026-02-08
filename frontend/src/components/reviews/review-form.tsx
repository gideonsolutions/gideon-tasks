"use client";

import { useState } from "react";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createReview } from "@/lib/api/reviews";
import type { ApiError } from "@/lib/types";

interface ReviewFormProps {
  taskId: string;
  onSuccess?: () => void;
}

export function ReviewForm({ taskId, onSuccess }: ReviewFormProps) {
  const [reliability, setReliability] = useState(0);
  const [quality, setQuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [integrity, setIntegrity] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();

  const isValid =
    reliability >= 1 && quality >= 1 && communication >= 1 && integrity >= 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setError("");
    setLoading(true);

    try {
      await createReview(taskId, {
        reliability,
        quality,
        communication,
        integrity,
        comment: comment.trim() || undefined,
      });
      addToast("Review submitted successfully", "success");
      onSuccess?.();
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.status === 202) {
        addToast("Your review was flagged for moderation", "warning");
      } else {
        setError(apiError.error ?? "Failed to submit review");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <StarRating
          value={reliability}
          onChange={setReliability}
          label="Reliability"
        />
        <StarRating
          value={quality}
          onChange={setQuality}
          label="Quality"
        />
        <StarRating
          value={communication}
          onChange={setCommunication}
          label="Communication"
        />
        <StarRating
          value={integrity}
          onChange={setIntegrity}
          label="Integrity"
        />
      </div>
      <Textarea
        id="review-comment"
        label="Comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your experience..."
      />
      <Button type="submit" loading={loading} disabled={!isValid}>
        Submit Review
      </Button>
    </form>
  );
}
