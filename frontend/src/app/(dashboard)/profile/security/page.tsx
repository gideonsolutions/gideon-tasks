"use client";

import { TwoStepSettings } from "@/components/two-step/two-step-settings";

export default function SecurityPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Two-step sign-in</h1>
      <TwoStepSettings />
    </div>
  );
}
