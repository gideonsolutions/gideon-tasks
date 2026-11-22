import type { Category } from "@/lib/types";

/**
 * The category a new task starts with: the one whose slug was asked for
 * (/tasks/new?category=tutoring), or the first in the list when the slug is
 * missing or doesn't match an active category.
 */
export function initialCategoryId(
  categories: Pick<Category, "id" | "slug">[],
  slug?: string,
): string {
  const match = slug ? categories.find((c) => c.slug === slug) : undefined;
  return match?.id ?? categories[0]?.id ?? "";
}
