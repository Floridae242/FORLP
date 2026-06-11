"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { HourlyDataPoint, CameraNode } from "@/types";
import { realHourlyPeak, realHourlyNormal } from "@/lib/api";

interface TrafficState {
  hourlyPeak: HourlyDataPoint[];
  hourlyNormal: HourlyDataPoint[];
  cameras: CameraNode[];
  totalEnter: number;
  totalLeave: number;
  netDensity: number;
  currentHourIndex: number;
  tick: number;
}

/**
 * Animates the dashboard's hourly curve and per-node counts by applying
 * ±3% jitter on top of the report-derived bell curve (NOT random data).
 *
 * Camera identity/coords/status come from the live IOC feed (passed in as
 * `baseCameras`); only the count values are simulated, because no real-time
 * per-camera people-count API exists yet.
 */
export function useTrafficData(baseCameras: CameraNode[], intervalMs = 5_000) {
  const tickRef = useRef(0);
  const camsRef = useRef(baseCameras);
  camsRef.current = baseCameras;

  const drift = useCallback((base: number, pct = 0.03): number => {
    if (base === 0) return 0;
    const jitter = 1 + (Math.random() * 2 - 1) * pct;
    return Math.round(base * jitter);
  }, []);

  const buildState = useCallback((): TrafficState => {
    const t = tickRef.current++;
    const peakBase = realHourlyPeak();
    const normalBase = realHourlyNormal();

    const hourlyPeak = peakBase.map((h) => ({
      ...h,
      enter: drift(h.enter),
      leave: drift(h.leave),
      net: drift(h.enter) - drift(h.leave),
      duplicate: drift(h.duplicate),
    }));

    const hourlyNormal = normalBase.map((h) => ({
      ...h,
      enter: drift(h.enter),
      leave: drift(h.leave),
      net: drift(h.enter) - drift(h.leave),
      duplicate: drift(h.duplicate),
    }));

    const cameras: CameraNode[] = camsRef.current.map((c) => {
      const enter = drift(c.enter);
      const leave = drift(c.leave);
      return { ...c, enter, leave, duplicate: drift(c.duplicate), net: enter - leave };
    });

    const totalEnter = cameras.reduce((s, c) => s + c.enter, 0);
    const totalLeave = cameras.reduce((s, c) => s + c.leave, 0);

    const now = new Date();
    const bangkokHour = (now.getUTCHours() + 7) % 24;
    const idx = hourlyPeak.findIndex((h) => parseInt(h.hour) >= bangkokHour);

    return {
      hourlyPeak,
      hourlyNormal,
      cameras,
      totalEnter,
      totalLeave,
      netDensity: totalEnter - totalLeave,
      currentHourIndex: idx >= 0 ? idx : hourlyPeak.length - 1,
      tick: t,
    };
  }, [drift]);

  const [state, setState] = useState<TrafficState>(buildState);

  useEffect(() => {
    const timer = setInterval(() => setState(buildState()), intervalMs);
    return () => clearInterval(timer);
  }, [buildState, intervalMs]);

  // rebuild immediately when the live camera list arrives/changes
  useEffect(() => {
    setState(buildState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCameras]);

  return state;
}
