"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { TaskList } from "@/components/tasks/task-list";
import { TaskFilters } from "@/components/tasks/task-filters";
import { Spinner } from "@/components/ui/spinner";
import { useApi } from "@/lib/hooks/use-api";
import * as tasksApi from "@/lib/api/tasks";

export default function HomePage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [locationType, setLocationType] = useState("");

  const params: Record<string, string> = {};
  if (status) params.status = status;
  if (search) params.search = search;
  if (locationType) params.location_type = locationType;

  const { data: tasks, loading } = useApi(
    () => tasksApi.listTasks(Object.keys(params).length > 0 ? params : undefined),
    [status, search, locationType],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Browse Tasks</h1>
        <TaskFilters
          status={status}
          onStatusChange={setStatus}
          search={search}
          onSearchChange={setSearch}
          locationType={locationType}
          onLocationTypeChange={setLocationType}
        />
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <TaskList tasks={tasks ?? []} />
        )}
      </main>
      <Footer />
    </div>
  );
}
