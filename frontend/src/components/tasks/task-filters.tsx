"use client";

import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { TaskStatus } from "@/lib/types";

interface TaskFiltersProps {
  status: string;
  onStatusChange: (status: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  locationType: string;
  onLocationTypeChange: (type: string) => void;
}

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "published", label: "Published" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "completed", label: "Completed" },
  { value: "disputed", label: "Disputed" },
  { value: "cancelled", label: "Cancelled" },
];

const locationOptions = [
  { value: "", label: "All Locations" },
  { value: "remote", label: "Remote" },
  { value: "in_person", label: "In Person" },
];

export function TaskFilters({
  status,
  onStatusChange,
  search,
  onSearchChange,
  locationType,
  onLocationTypeChange,
}: TaskFiltersProps) {
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
        options={statusOptions}
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
      />
      <Select
        options={locationOptions}
        value={locationType}
        onChange={(e) => onLocationTypeChange(e.target.value)}
      />
    </div>
  );
}
