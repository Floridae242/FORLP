import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { CrowdStatus } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface StatCardProps {
  label: string;
  value: number;
  unit?: string;
  icon?: ReactNode;
  /** % เทียบรอบก่อนหน้า — บวก = เพิ่มขึ้น */
  trend?: number;
  sparklineData?: number[];
  /** tailwind bg-* class ของแท่ง sparkline เช่น "bg-amber-400" */
  sparklineColor?: string;
  status?: CrowdStatus;
  highlight?: boolean;
}

export function StatCard({
  label,
  value,
  unit,
  icon,
  trend,
  sparklineData,
  sparklineColor = "bg-amber-400",
  status,
  highlight = false,
}: StatCardProps) {
  const max = sparklineData?.length ? Math.max(...sparklineData, 1) : 1;

  return (
    <div
      className={`group relative rounded-2xl border p-5 backdrop-blur-xl transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.05] ${
        highlight
          ? "border-amber-500/20 bg-amber-500/[0.04]"
          : "border-white/[0.06] bg-white/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
          {icon}
        </div>
        {status && <StatusBadge status={status} />}
        {status == null && trend != null && (
          <span
            className={`flex items-center gap-1 text-xs font-medium tabular-nums ${
              trend >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {trend >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {trend >= 0 ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>

      <div className="mt-4">
        <span className="text-3xl font-semibold tabular-nums text-slate-100">
          {value.toLocaleString()}
        </span>
        {unit && (
          <span className="ml-1.5 text-sm text-slate-500 font-thai">{unit}</span>
        )}
        <p className="mt-1 text-sm text-slate-500 font-thai">{label}</p>
      </div>

      {sparklineData && sparklineData.length > 1 && (
        <div className="sparkline-container mt-3" aria-hidden="true">
          {sparklineData.map((v, i) => (
            <div
              key={i}
              className={`sparkline-bar ${sparklineColor} opacity-60 group-hover:opacity-90`}
              style={{ height: `${Math.max(8, Math.round((v / max) * 100))}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
