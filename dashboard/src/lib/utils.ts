import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CrowdStatus, StatusConfig } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_MAP: Record<CrowdStatus, StatusConfig> = {
  normal: {
    key: "normal",
    label: "ปกติ",
    desc: "สภาพปกติ ไหลลื่น",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
  },
  moderate: {
    key: "moderate",
    label: "ปานกลาง",
    desc: "ค่อนข้างคึกคัก",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
  },
  busy: {
    key: "busy",
    label: "หนาแน่น",
    desc: "เริ่มแออัด ควรระวัง",
    color: "text-orange-400",
    bg: "bg-orange-500/15",
  },
  crowded: {
    key: "crowded",
    label: "หนาแน่นมาก",
    desc: "แจ้งเตือนทันที",
    color: "text-rose-400",
    bg: "bg-rose-500/15",
  },
};

export function getStatusFromCount(count: number): StatusConfig {
  if (count > 900) return STATUS_MAP.crowded;
  if (count >= 501) return STATUS_MAP.busy;
  if (count >= 201) return STATUS_MAP.moderate;
  return STATUS_MAP.normal;
}

export function formatThaiTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  });
}

export function formatThaiDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("th-TH");
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
