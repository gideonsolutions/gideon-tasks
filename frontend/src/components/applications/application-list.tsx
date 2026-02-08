"use client";

import type { TaskApplication } from "@/lib/types";
import { ApplicationCard } from "./application-card";

interface ApplicationListProps {
  applications: TaskApplication[];
  onAccept?: (applicationId: string) => void;
}

export function ApplicationList({ applications, onAccept }: ApplicationListProps) {
  if (applications.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-500">No applications yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {applications.map((application) => (
        <ApplicationCard
          key={application.id}
          application={application}
          onAccept={onAccept}
        />
      ))}
    </div>
  );
}
