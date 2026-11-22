"use client";

import { PreparerProofs } from "@/components/documents/preparer-proofs";

export default function PreparerProofPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Tax preparer</h1>
      <PreparerProofs />
    </div>
  );
}
