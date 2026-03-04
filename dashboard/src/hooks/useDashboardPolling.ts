"use client";

import { useEffect, useRef } from "react";
import { useDashboardStore } from "@/stores/dashboard";

const POLL_INTERVAL = 30_000;

export function useDashboardPolling() {
  const fetchAll = useDashboardStore((s) => s.fetchAll);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll]);
}
