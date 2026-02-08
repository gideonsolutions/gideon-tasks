"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FeeBreakdownDisplay } from "./fee-breakdown";
import { useToast } from "@/components/ui/toast";
import { MIN_TASK_PRICE_CENTS } from "@/lib/constants";
import type { CreateTaskRequest, ApiError } from "@/lib/types";
import * as tasksApi from "@/lib/api/tasks";

interface TaskFormProps {
  initialData?: Partial<CreateTaskRequest>;
  taskId?: string;
  mode?: "create" | "edit";
}

export function TaskForm({ initialData, taskId, mode = "create" }: TaskFormProps) {
  const [form, setForm] = useState({
    title: initialData?.title ?? "",
    description: initialData?.description ?? "",
    category_id: initialData?.category_id ?? "",
    location_type: initialData?.location_type ?? "remote",
    location_address: initialData?.location_address ?? "",
    price_dollars: initialData?.price_cents
      ? (initialData.price_cents / 100).toString()
      : "",
    deadline: initialData?.deadline?.split("T")[0] ?? "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { addToast } = useToast();

  const priceCents = Math.round(parseFloat(form.price_dollars || "0") * 100);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (priceCents < MIN_TASK_PRICE_CENTS) {
      setError(`Minimum task price is $${(MIN_TASK_PRICE_CENTS / 100).toFixed(2)}`);
      return;
    }

    setLoading(true);
    try {
      const data: CreateTaskRequest = {
        title: form.title,
        description: form.description,
        category_id: form.category_id,
        location_type: form.location_type as "remote" | "in_person",
        price_cents: priceCents,
        deadline: new Date(form.deadline).toISOString(),
      };

      if (form.location_type === "in_person" && form.location_address) {
        data.location_address = form.location_address;
      }

      let task;
      if (mode === "edit" && taskId) {
        task = await tasksApi.updateTask(taskId, data);
      } else {
        task = await tasksApi.createTask(data);
      }
      addToast(mode === "edit" ? "Task updated" : "Task created", "success");
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.status === 202) {
        addToast("Content flagged for review", "warning");
        router.push("/dashboard");
      } else {
        setError(apiError.error ?? "Failed to save task");
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
      <Input
        id="title"
        label="Title"
        required
        value={form.title}
        onChange={(e) => update("title", e.target.value)}
        placeholder="What do you need done?"
      />
      <Textarea
        id="description"
        label="Description"
        required
        value={form.description}
        onChange={(e) => update("description", e.target.value)}
        placeholder="Describe the task in detail..."
      />
      <Input
        id="category_id"
        label="Category ID"
        required
        value={form.category_id}
        onChange={(e) => update("category_id", e.target.value)}
        placeholder="Category UUID"
      />
      <Select
        id="location_type"
        label="Location Type"
        value={form.location_type}
        onChange={(e) => update("location_type", e.target.value)}
        options={[
          { value: "remote", label: "Remote" },
          { value: "in_person", label: "In Person" },
        ]}
      />
      {form.location_type === "in_person" && (
        <Input
          id="location_address"
          label="Address"
          required
          value={form.location_address}
          onChange={(e) => update("location_address", e.target.value)}
          placeholder="Full address"
        />
      )}
      <Input
        id="price"
        label="Price ($)"
        type="number"
        step="0.01"
        min={(MIN_TASK_PRICE_CENTS / 100).toFixed(2)}
        required
        value={form.price_dollars}
        onChange={(e) => update("price_dollars", e.target.value)}
        placeholder="5.00"
      />
      {priceCents >= MIN_TASK_PRICE_CENTS && (
        <FeeBreakdownDisplay priceCents={priceCents} />
      )}
      <Input
        id="deadline"
        label="Deadline"
        type="date"
        required
        value={form.deadline}
        onChange={(e) => update("deadline", e.target.value)}
      />
      <Button type="submit" loading={loading} className="w-full">
        {mode === "edit" ? "Update Task" : "Create Task"}
      </Button>
    </form>
  );
}
