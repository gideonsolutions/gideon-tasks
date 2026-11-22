"use client";

import { useApi } from "@/lib/hooks/use-api";
import * as documentsApi from "@/lib/api/documents";

/** Whether document storage is set up (null while it loads). */
export function useDocumentsEnabled(skip = false): boolean | null {
  const { data } = useApi(
    () => (skip ? Promise.resolve(null) : documentsApi.getDocumentsConfig()),
    [skip],
  );
  return data ? data.enabled : null;
}
