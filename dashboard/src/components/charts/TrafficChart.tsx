"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyDataPoint } from "@/types";

interface TrafficChartProps {
  peak: HourlyDataPoint[];
  normal: HourlyDataPoint[];
}

interface ChartRow {
  hour: string;
  peakLeave: number;
  peakEnter: number;
  normalLeave: number;
}

const SERIES_LABEL: Record<string, string> = {
  peakLeave: "วันตลาด — Leave",
  peakEnter: "วันตลาด — Enter",
  normalLeave: "วันธรรมดา — Leave",
};

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: number | string; color?: string }[];
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#1E293B]/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xl">
      <p className="mb-1 font-semibold tabular-nums text-slate-200">{label} น.</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="tabular-nums font-thai" style={{ color: p.color }}>
          {SERIES_LABEL[String(p.dataKey)] ?? p.dataKey}:{" "}
          <strong>{Number(p.value).toLocaleString()}</strong> คน
        </p>
      ))}
    </div>
  );
}

export function TrafficChart({ peak, normal }: TrafficChartProps) {
  const data: ChartRow[] = peak.map((h, i) => ({
    hour: h.hour,
    peakLeave: h.leave,
    peakEnter: h.enter,
    normalLeave: normal[i]?.leave ?? 0,
  }));

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 font-thai">
            Traffic รายชั่วโมง — วันตลาด vs วันธรรมดา
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500 font-thai">
            อ้างอิงรายงาน NVR กล้อง LPG-B01-Temp-CC-01
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-thai">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-orange-400" /> วันตลาด
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-cyan-400" /> วันธรรมดา
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="gradPeakLeave" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradNormalLeave" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="peakLeave"
            stroke="#f97316"
            strokeWidth={2}
            fill="url(#gradPeakLeave)"
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Area
            type="monotone"
            dataKey="peakEnter"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="none"
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Area
            type="monotone"
            dataKey="normalLeave"
            stroke="#06b6d4"
            strokeWidth={1.5}
            fill="url(#gradNormalLeave)"
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
