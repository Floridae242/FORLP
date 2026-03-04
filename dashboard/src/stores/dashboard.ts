import { create } from "zustand";
import type {
  PeopleCount,
  DailySummary,
  HourlyDataPoint,
  WeatherData,
  CameraNode,
  ZoneDensity,
  Alert,
} from "@/types";
import {
  api,
  realCurrentCount,
  realHourlyPeak,
  realHourlyNormal,
  realZones,
  realWeather,
  REAL_CAMERAS,
  REPORT_SCENARIOS,
} from "@/lib/api";

interface DashboardStore {
  currentCount: PeopleCount | null;
  dailySummary: DailySummary | null;
  hourlyPeak: HourlyDataPoint[];
  hourlyNormal: HourlyDataPoint[];
  weather: WeatherData | null;
  cameras: CameraNode[];
  zones: ZoneDensity[];
  alerts: Alert[];
  selectedCamera: string | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;

  setSelectedCamera: (id: string | null) => void;
  acknowledgeAlert: (id: string) => void;
  fetchAll: () => Promise<void>;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  currentCount: null,
  dailySummary: null,
  hourlyPeak: [],
  hourlyNormal: [],
  weather: null,
  cameras: [],
  zones: [],
  alerts: [],
  selectedCamera: null,
  isLoading: true,
  error: null,
  lastUpdated: null,

  setSelectedCamera: (id) => set({ selectedCamera: id }),

  acknowledgeAlert: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === id ? { ...a, acknowledged: true } : a
      ),
    })),

  fetchAll: async () => {
    try {
      set({ isLoading: get().currentCount === null, error: null });

      let currentCount: PeopleCount;
      let dailySummary: DailySummary;
      let weather: WeatherData;

      try {
        [currentCount, dailySummary, weather] = await Promise.all([
          api.getCurrentCount(),
          api.getDailySummary(),
          api.getWeather(),
        ]);
      } catch {
        // Fallback to real hardcoded data from PDF
        currentCount = realCurrentCount();
        weather = realWeather();
        const peak = REPORT_SCENARIOS[0];
        dailySummary = {
          date: peak.date,
          max_people: peak.leave,
          avg_people: Math.round((peak.leave + REPORT_SCENARIOS[5].leave) / 2),
          min_people: REPORT_SCENARIOS[5].leave,
          total_samples: 288,
        };
      }

      const cameras = REAL_CAMERAS;
      const zones = realZones();
      const hourlyPeak = realHourlyPeak();
      const hourlyNormal = realHourlyNormal();

      // Build alerts from real thresholds (2500 = safety threshold from PDF)
      const totalLeave = cameras.reduce((s, c) => s + c.leave, 0);
      const alerts: Alert[] = [];
      if (totalLeave > 2500) {
        alerts.push({
          id: "alert-crowd-" + Date.now(),
          type: "crowd",
          level: "critical",
          message: `🚨 CROWD ALERT: ความหนาแน่นสูง — ${totalLeave.toLocaleString()} คนผ่านพื้นที่ (เกิน 2,500)`,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        });
      }

      set({
        currentCount,
        dailySummary,
        hourlyPeak,
        hourlyNormal,
        weather,
        cameras,
        zones,
        alerts,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Unknown error",
        isLoading: false,
      });
    }
  },
}));
