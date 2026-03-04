"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { HourlyDataPoint, CameraNode } from "@/types";
import { REAL_CAMERAS, realHourlyPeak, realHourlyNormal } from "@/lib/api";

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
 * Simulates real-time updates by interpolating historical data
 * from the PDF report. Uses the realistic 16:00-22:00 market
 * bell-curve — NOT random numbers.
 *
 * Drift factor applies ±3% jitter to simulate live feed variance
 * while keeping numbers anchored to real report values.
 */
export function useTrafficData(intervalMs = 5_000) {
  const tickRef = useRef(0);

  const drift = useCallback((base: number, pct = 0.03): number => {
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

    const cameras: CameraNode[] = REAL_CAMERAS.map((c) => ({
      ...c,
      enter: drift(c.enter),
      leave: drift(c.leave),
      duplicate: drift(c.duplicate),
      net: drift(c.enter) - drift(c.leave),
    }));

    const totalEnter = cameras.reduce((s, c) => s + c.enter, 0);
    const totalLeave = cameras.reduce((s, c) => s + c.leave, 0);

    // Simulate which hour we're "viewing" based on tick
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

  return state;
}
