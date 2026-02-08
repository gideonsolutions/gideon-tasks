"use client";

import { clsx } from "clsx";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  size?: "sm" | "md" | "lg";
  readonly?: boolean;
  label?: string;
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function StarRating({
  value,
  onChange,
  max = 5,
  size = "md",
  readonly = false,
  label,
}: StarRatingProps) {
  return (
    <div className="space-y-1">
      {label && (
        <span className="block text-sm font-medium text-gray-700">
          {label}
        </span>
      )}
      <div className="flex gap-0.5">
        {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(star)}
            className={clsx(
              "transition-colors",
              readonly ? "cursor-default" : "cursor-pointer hover:text-amber-400",
            )}
          >
            <svg
              className={clsx(
                sizeMap[size],
                star <= value ? "text-amber-400 fill-current" : "text-gray-300 fill-current",
              )}
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
