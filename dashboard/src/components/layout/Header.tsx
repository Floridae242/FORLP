"use client";

import { useEffect, useState } from "react";
import { Activity, Thermometer, Wind } from "lucide-react";
import { useClock } from "@/hooks/useClock";
import { useDashboardStore } from "@/stores/dashboard";

export function Header() {
  const { time, date } = useClock();
  const weather = useDashboardStore((s) => s.weather);

  // เวลาเริ่มจาก new Date() ฝั่ง client — ต้องรอ mount ก่อนค่อยแสดง กัน hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#1E293B]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1920px] items-center justify-between gap-4 px-4 lg:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <Activity className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide text-slate-100">
              Smart Area IOC
            </div>
            <div className="text-[11px] text-slate-500 font-thai">
              ระบบนับจำนวนผู้ใช้พื้นที่ • กาดกองต้า ลำปาง
            </div>
          </div>
        </div>

        {/* Right side: weather • live • clock */}
        <div className="flex items-center gap-3 lg:gap-5">
          {weather && (
            <div className="hidden items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400 md:flex">
              <span className="flex items-center gap-1.5">
                <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                <span className="tabular-nums">{weather.temp}°C</span>
              </span>
              {weather.pm25 != null && (
                <span className="flex items-center gap-1.5">
                  <Wind className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="tabular-nums">PM2.5 {weather.pm25}</span>
                </span>
              )}
              <span className="font-thai text-slate-500">{weather.description}</span>
            </div>
          )}

          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            LIVE
          </span>

          <div className="text-right leading-tight">
            <div className="text-sm font-semibold tabular-nums text-slate-100">
              {mounted ? `${time} น.` : "--:--"}
            </div>
            <div className="text-[11px] text-slate-500 font-thai">
              {mounted ? date : ""}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
