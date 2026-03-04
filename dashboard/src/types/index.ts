export type CrowdStatus = "normal" | "moderate" | "busy" | "crowded";

export interface StatusConfig {
  key: CrowdStatus;
  label: string;
  desc: string;
  color: string;
  bg: string;
}

export interface PeopleCount {
  count: number;
  smoothed_count: number;
  max_count: number;
  status: CrowdStatus;
  status_label: string;
  timestamp: string | null;
  source: string;
  source_latency_s: number;
  is_stale: boolean;
  camera_count: number;
}

export interface DailySummary {
  date: string;
  max_people: number;
  avg_people: number;
  min_people: number;
  total_samples: number;
  status?: CrowdStatus;
  status_label?: string;
}

export interface HourlyDataPoint {
  hour: string;
  enter: number;
  leave: number;
  net: number;
  duplicate: number;
}

export interface WeatherData {
  temp: number;
  humidity: number;
  description: string;
  icon: string;
  wind_speed: number;
  pm25?: number;
  aqi?: number;
}

export interface CameraNode {
  id: string;
  cameraId: string;
  label: string;
  labelTh: string;
  zone: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
  enter: number;
  leave: number;
  duplicate: number;
  net: number;
  status: "online" | "offline";
}

export interface ZoneDensity {
  zone: string;
  label: string;
  density: number;
  capacity: number;
  percentage: number;
  status: CrowdStatus;
}

export interface Alert {
  id: string;
  type: "crowd" | "weather" | "device" | "safety";
  level: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

// Real data scenarios from PDF report
export interface ReportScenario {
  date: string;
  label: string;
  enter: number;
  leave: number;
  duplicate: number;
  net: number;
}
