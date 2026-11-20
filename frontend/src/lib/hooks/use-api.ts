"use client";

import { useState, useEffect, useCallback } from "react";
import type { ApiError } from "@/lib/types";

interface UseApiResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/**
 * Runs `fetcher` on mount, whenever `deps` change and on `refetch()`.
 *
 * `loading` and `error` are derived from which deps the last settled request
 * ran for, rather than reset with setState inside the effect (which
 * eslint-plugin-react-hooks 7.1 rejects). Behaviour is unchanged: while a
 * new request runs, `loading` is true, `error` is null and the previous
 * `data` stays visible; responses for superseded requests are ignored.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseApiResult<T> {
  const [refetchCount, setRefetchCount] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [settled, setSettled] = useState<{
    deps: unknown[];
    error: ApiError | null;
  } | null>(null);

  const refetch = useCallback(() => {
    setRefetchCount((c) => c + 1);
  }, []);

  const currentDeps = [refetchCount, ...deps];

  useEffect(() => {
    let cancelled = false;
    const requestDeps = currentDeps;

    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setSettled({ deps: requestDeps, error: null });
        }
      })
      .catch((err: ApiError) => {
        if (!cancelled) {
          setSettled({ deps: requestDeps, error: err });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchCount, ...deps]);

  const isCurrent = settled !== null && sameDeps(settled.deps, currentDeps);
  return {
    data,
    error: isCurrent ? settled.error : null,
    loading: !isCurrent,
    refetch,
  };
}
