"use client";

import { useDashboardStore } from "@/stores/dashboard";
import { useDashboardPolling } from "@/hooks/useDashboardPolling";
import { useTrafficData } from "@/hooks/useTrafficData";
import { getStatusFromCount, formatThaiTime } from "@/lib/utils";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { TrafficChart } from "@/components/charts/TrafficChart";
import { LiveMap } from "@/components/map/LiveMap";
import { HeatmapGrid } from "@/components/dashboard/HeatmapGrid";
import { CCTVGrid } from "@/components/dashboard/CCTVGrid";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Users,
  LogIn,
  LogOut,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Copy,
} from "lucide-react";
import { REPORT_SCENARIOS } from "@/lib/api";

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#0f172a]">
      <div className="sticky top-0 z-50 h-16 border-b border-white/[0.06] bg-[#1E293B]/90 backdrop-blur-xl" />
      <div className="mx-auto max-w-[1920px] p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="skeleton col-span-2 h-[400px]" />
          <div className="skeleton h-[400px]" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="skeleton h-[340px]" />
          <div className="skeleton h-[340px]" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  useDashboardPolling();
  const traffic = useTrafficData(5000);

  const {
    hourlyPeak,
    hourlyNormal,
    zones,
    selectedCamera,
    setSelectedCamera,
    alerts,
    acknowledgeAlert,
    isLoading,
    lastUpdated,
    fetchAll,
  } = useDashboardStore();

  if (isLoading && hourlyPeak.length === 0) {
    return <LoadingSkeleton />;
  }

  // Use live-interpolated data from useTrafficData
  const { cameras, totalEnter, totalLeave, netDensity } = traffic;

  const peakScenario = REPORT_SCENARIOS[0]; // 07/02/2026 Night Market
  const status = getStatusFromCount(Math.abs(netDensity));
  const safetyExceeded = totalLeave > 2500;

  // Sparkline data from hourly peaks (leave values for bell curve)
  const sparkLeave = hourlyPeak.map((h) => h.leave);
  const sparkEnter = hourlyPeak.map((h) => h.enter);

  const unackedAlerts = alerts.filter((a) => !a.acknowledged);

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <Header />

      <main className="mx-auto max-w-[1920px] p-4 lg:p-6">

        {/* ─── Alert Banner ─── */}
        {unackedAlerts.length > 0 && (
          <div className="mb-4 space-y-2">
            {unackedAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 backdrop-blur-xl"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                  <span className="text-sm text-rose-300 font-thai">{alert.message}</span>
                </div>
                <button
                  onClick={() => acknowledgeAlert(alert.id)}
                  className="rounded-lg bg-rose-500/10 px-3 py-1 text-xs text-rose-400 transition-colors hover:bg-rose-500/20 font-thai"
                >
                  รับทราบ
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ─── Top: Key Metrics with Sparklines ─── */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard
            label="Enter (เข้าพื้นที่)"
            value={totalEnter}
            unit="คน"
            icon={<LogIn className="h-5 w-5 text-amber-400" />}
            trend={16}
            sparklineData={sparkEnter}
            sparklineColor="bg-amber-400"
          />
          <StatCard
            label="Leave (ออกจากพื้นที่)"
            value={totalLeave}
            unit="คน"
            icon={<LogOut className="h-5 w-5 text-orange-400" />}
            trend={22}
            sparklineData={sparkLeave}
            sparklineColor="bg-orange-400"
          />
          <StatCard
            label="Net Density (คงเหลือ)"
            value={Math.abs(netDensity)}
            unit="คน"
            icon={<Users className="h-5 w-5 text-amber-400" />}
            status={status.key}
            highlight
          />
          <div className={`group relative rounded-2xl border p-5 backdrop-blur-xl transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.05] ${safetyExceeded ? "border-rose-500/20 bg-rose-500/[0.04] pulse-glow-red" : "border-white/[0.06] bg-white/[0.03]"}`}>
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-slate-400 transition-colors group-hover:text-white/80">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <StatusBadge
                status={safetyExceeded ? "crowded" : "normal"}
                pulse={safetyExceeded}
              />
            </div>
            <div className="mt-4">
              <span className="text-lg font-semibold text-slate-100 font-thai">
                {safetyExceeded ? "เกินเกณฑ์!" : "ปลอดภัย"}
              </span>
              <p className="mt-1 text-sm text-slate-500 font-thai">Safety Threshold</p>
            </div>
            <div className="mt-2 text-[10px] text-slate-600 font-thai">
              เกณฑ์: 2,500 คน • Peak: {peakScenario.leave.toLocaleString()} (07/02/2026)
            </div>
          </div>
        </section>

        {/* ─── Middle: Map + Heatmap (Bento) ─── */}
        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LiveMap
              cameras={cameras}
              selectedCamera={selectedCamera}
              onSelectCamera={setSelectedCamera}
            />
          </div>
          <div>
            <HeatmapGrid zones={zones} />
          </div>
        </section>

        {/* ─── Analytics: AreaChart + CCTV ─── */}
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <TrafficChart
            peak={traffic.hourlyPeak}
            normal={traffic.hourlyNormal}
          />
          <CCTVGrid cameras={cameras} />
        </section>

        {/* ─── Data Source Reference ─── */}
        <section className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-xl">
          <h3 className="mb-3 text-sm font-semibold text-slate-200 font-thai">
            ข้อมูลอ้างอิงจากรายงาน (PDF Report Logs)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Scenario</th>
                  <th className="pb-2 pr-4 font-medium tabular-nums text-right">Enter</th>
                  <th className="pb-2 pr-4 font-medium tabular-nums text-right">Leave</th>
                  <th className="pb-2 pr-4 font-medium tabular-nums text-right">Duplicate</th>
                  <th className="pb-2 font-medium tabular-nums text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {REPORT_SCENARIOS.map((s) => (
                  <tr key={s.date} className="border-b border-white/[0.03] text-slate-300 hover:bg-white/[0.02]">
                    <td className="py-2 pr-4 tabular-nums">{s.date}</td>
                    <td className="py-2 pr-4">{s.label}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-amber-400">{s.enter.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-orange-400">{s.leave.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-500">{s.duplicate}</td>
                    <td className="py-2 text-right tabular-nums text-slate-400">{s.net.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-slate-600 font-thai">
            Camera: LPG-B01-Temp-CC-01 • Source: โครงการพัฒนาระบบนับจำนวนผู้ใช้พื้นที่กาดกองต้า (เทศบาลนครลำปาง)
          </p>
        </section>

        {/* ─── Footer bar ─── */}
        <footer className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-white/[0.04] pt-4 text-[11px] text-slate-600 sm:flex-row">
          <span className="font-thai">
            Kad Kong Ta AI People Counting System • เทศบาลนครลำปาง • Piramid Solutions
          </span>
          <div className="flex items-center gap-3">
            <span className="tabular-nums">
              อัปเดต: {formatThaiTime(lastUpdated)} น.
            </span>
            <button
              onClick={() => fetchAll()}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
            >
              <RefreshCw className="h-3 w-3" />
              <span className="font-thai">รีเฟรช</span>
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
