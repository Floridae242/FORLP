import type {
  PeopleCount,
  DailySummary,
  HourlyDataPoint,
  WeatherData,
  ZoneDensity,
  ReportScenario,
} from "@/types";
import { PEAK_ZONE_SPLIT } from "@/lib/cctv";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://forlp.onrender.com";

async function fetcher<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}: ${endpoint}`);
  const json = await res.json();
  return json.data ?? json;
}

export const api = {
  getCurrentCount: () => fetcher<PeopleCount>("/api/people/current"),
  getDailySummary: (date?: string) =>
    fetcher<DailySummary>(date ? `/api/people/daily?date=${date}` : "/api/people/daily"),
  getHourlyData: (date?: string) =>
    fetcher<HourlyDataPoint[]>(date ? `/api/people/hourly?date=${date}` : "/api/people/hourly"),
  getWeather: () => fetcher<WeatherData>("/api/weather/current"),
  getZones: async (): Promise<ZoneDensity[]> => {
    const json = await fetch(
      `${API_BASE}/api/zones/current`,
      { cache: "no-store" }
    );
    if (!json.ok) throw new Error(`Zones API ${json.status}`);
    const body = await json.json();
    const data = body.data;
    return (data.zones as Array<{
      zone_code: string;
      name: string;
      percentage: number;
      estimated_count: number | null;
      crowd_level: string;
    }>).map((z) => ({
      zone: z.zone_code,
      label: z.name,
      density: z.estimated_count ?? 0,
      capacity: data.total_people ?? 0,
      percentage: z.percentage,
      status: z.crowd_level as import("@/types").CrowdStatus,
    }));
  },
};

// ─────────────────────────────────────────────────────
// REAL DATA from PDF Report (เทศบาลนครลำปาง)
// Camera: LPG-B01-Temp-CC-01
// ─────────────────────────────────────────────────────

// ตัวเลข enter/leave ของ 02/07, 02/08, 02/09, 02/11 ตรงตามรายงาน NVR ใน ref/เทศบาลนครลำปาง.pdf
// แถวอื่นเป็นค่าประมาณ (ไม่มีรายงานยืนยัน)
export const REPORT_SCENARIOS: ReportScenario[] = [
  { date: "2026-02-07", label: "Night Market (Sat, Peak)", enter: 337, leave: 3161, duplicate: 0, net: 337 - 3161 },
  { date: "2026-02-08", label: "Night Market (Sun)", enter: 304, leave: 2018, duplicate: 0, net: 304 - 2018 },
  { date: "2026-02-09", label: "Weekday (Mon)", enter: 64, leave: 416, duplicate: 0, net: 64 - 416 },
  { date: "2026-02-10", label: "Weekday (Tue)", enter: 42, leave: 198, duplicate: 8, net: 42 - 198 },
  { date: "2026-02-11", label: "Weekday (Wed)", enter: 52, leave: 416, duplicate: 0, net: 52 - 416 },
  { date: "2026-02-12", label: "Weekday (Thu AM)", enter: 19, leave: 89, duplicate: 3, net: 19 - 89 },
  { date: "2026-02-13", label: "Weekday (Fri)", enter: 27, leave: 121, duplicate: 4, net: 27 - 121 },
];

// Camera identity, coordinates and live online/offline status are no longer
// hardcoded — they are fetched at runtime from the Lampang IOC via the
// /api/cctv route handler (see src/lib/ioc.ts + src/lib/cctv.ts).

/** Realistic bell-curve for market hours 16:00-22:00 based on PDF data */
function buildMarketCurve(peakEnter: number, peakLeave: number): HourlyDataPoint[] {
  // Shape: ramp 14-16, peak 17-20, decline 21-22, quiet otherwise
  const curve: Record<number, number> = {
    10: 0.02, 11: 0.03, 12: 0.04, 13: 0.05,
    14: 0.10, 15: 0.18, 16: 0.42, 17: 0.72,
    18: 0.92, 19: 1.00, 20: 0.88, 21: 0.55, 22: 0.18,
  };
  return Object.entries(curve).map(([h, pct]) => {
    const enter = Math.round(peakEnter * pct);
    const leave = Math.round(peakLeave * pct);
    return {
      hour: h.padStart(2, "0"),
      enter,
      leave,
      net: enter - leave,
      duplicate: Math.round(enter * 0.12),
    };
  });
}

export function realHourlyPeak(): HourlyDataPoint[] {
  return buildMarketCurve(337, 3161);
}

export function realHourlyNormal(): HourlyDataPoint[] {
  return buildMarketCurve(19, 89);
}

// Fallback zone densities (used only when the FORLP /api/zones API is down).
// Densities come from the report-derived peak split, not from camera state.
export function realZones(): ZoneDensity[] {
  const defs = [
    { zone: "A", label: "ทางเข้าหลัก (แยกกลาง)", capacity: 1500, leave: PEAK_ZONE_SPLIT.A1.leave },
    { zone: "B", label: "สะพานรัษฎา / ตลาดเก่า", capacity: 2000, leave: PEAK_ZONE_SPLIT.B1.leave + PEAK_ZONE_SPLIT.B2.leave },
  ];
  return defs.map((z) => {
    const pct = Math.round((z.leave / z.capacity) * 100);
    const status: "crowded" | "busy" | "moderate" | "normal" =
      pct > 85 ? "crowded" : pct > 65 ? "busy" : pct > 40 ? "moderate" : "normal";
    return {
      zone: z.zone,
      label: z.label,
      density: z.leave,
      capacity: z.capacity,
      percentage: Math.min(pct, 100),
      status,
    };
  });
}

export function realWeather(): WeatherData {
  return {
    temp: 31,
    humidity: 62,
    description: "เมฆบางส่วน",
    icon: "02d",
    wind_speed: 8,
    pm25: 24,
    aqi: 52,
  };
}

export function realCurrentCount(): PeopleCount {
  const scenario = REPORT_SCENARIOS[0]; // Peak event
  return {
    count: scenario.leave,
    smoothed_count: scenario.leave,
    max_count: scenario.leave,
    status: "crowded",
    status_label: "หนาแน่นมาก",
    timestamp: new Date().toISOString(),
    source: "ai",
    source_latency_s: 3,
    is_stale: false,
    camera_count: 3,
  };
}
