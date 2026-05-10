"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { Category } from "@/lib/types";
import * as categoriesApi from "@/lib/api/categories";

interface TaskFiltersProps {
  search: string;
  onSearchChange: (search: string) => void;
  locationType: string;
  onLocationTypeChange: (type: string) => void;
  categoryId: string;
  onCategoryChange: (id: string) => void;
  sort: string;
  onSortChange: (sort: string) => void;
}

const locationOptions = [
  { value: "", label: "All Locations" },
  { value: "remote", label: "Remote" },
  { value: "in_person", label: "In Person" },
];

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "deadline_asc", label: "Deadline: soonest" },
];

export function TaskFilters({
  search,
  onSearchChange,
  locationType,
  onLocationTypeChange,
  categoryId,
  onCategoryChange,
  sort,
  onSortChange,
}: TaskFiltersProps) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    categoriesApi
      .listCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  const categoryOptions = [
    { value: "", label: "All Categories" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <div className="flex-1 min-w-[200px]">
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <Select
        options={categoryOptions}
        value={categoryId}
        onChange={(e) => onCategoryChange(e.target.value)}
      />
      <Select
        options={locationOptions}
        value={locationType}
        onChange={(e) => onLocationTypeChange(e.target.value)}
      />
      <Select
        options={sortOptions}
        value={sort}
        onChange={(e) => onSortChange(e.target.value)}
      />
    </div>
  );
}
