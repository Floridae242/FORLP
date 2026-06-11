"use client";

import { useEffect, useState } from "react";
import type { CameraNode } from "@/types";

interface CctvState {
  cameras: CameraNode[];
  mapNodes: CameraNode[];
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
}

const POLL_MS = 60_000; // refresh live CCTV status once a minute

/** Fetches live Kad Kong Ta cameras + status from the IOC proxy (/api/cctv). */
export function useCctvCameras(): CctvState {
  const [state, setState] = useState<CctvState>({
    cameras: [],
    mapNodes: [],
    loading: true,
    error: null,
    fetchedAt: null,
  });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/cctv", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        if (!active) return;
        setState({
          cameras: body.cameras ?? [],
          mapNodes: body.mapNodes ?? [],
          loading: false,
          error: null,
          fetchedAt: body.fetchedAt ?? null,
        });
      } catch (e) {
        if (!active) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load CCTV data",
        }));
      }
    }

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return state;
}
