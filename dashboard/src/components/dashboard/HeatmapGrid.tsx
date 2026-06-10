import { Flame } from "lucide-react";
import type { ZoneDensity } from "@/types";

interface HeatmapGridProps {
  zones: ZoneDensity[];
}

// สัดส่วนความหนาแน่นรายชั่วโมงช่วงตลาดเปิด 16:00–22:00 (bell curve จากรายงาน NVR)
const MARKET_HOURS: { hour: string; weight: number }[] = [
  { hour: "16", weight: 0.42 },
  { hour: "17", weight: 0.72 },
  { hour: "18", weight: 0.92 },
  { hour: "19", weight: 1.0 },
  { hour: "20", weight: 0.88 },
  { hour: "21", weight: 0.55 },
  { hour: "22", weight: 0.18 },
];

function heatColor(intensity: number): string {
  // ไล่จากเหลืองอำพันจาง → ส้ม → แดง ตามความหนาแน่น
  if (intensity > 0.75) return `rgba(244,63,94,${0.15 + intensity * 0.55})`;
  if (intensity > 0.45) return `rgba(249,115,22,${0.12 + intensity * 0.5})`;
  return `rgba(245,158,11,${0.06 + intensity * 0.4})`;
}

export function HeatmapGrid({ zones }: HeatmapGridProps) {
  return (
    <div className="flex h-full min-h-[400px] flex-col rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200 font-thai">
            <Flame className="h-4 w-4 text-orange-400" />
            Heatmap ความหนาแน่นตามโซน
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500 font-thai">
            ช่วงตลาดเปิด 16:00–22:00 น.
          </p>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500 font-thai">
          ยังไม่มีข้อมูลโซน
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-4">
          {/* ตาราง heat: แถว = โซน, คอลัมน์ = ชั่วโมง */}
          <div
            className="grid flex-1 gap-1.5"
            style={{
              gridTemplateColumns: `2.5rem repeat(${MARKET_HOURS.length}, 1fr)`,
              gridTemplateRows: `repeat(${zones.length}, 1fr) 1.25rem`,
            }}
          >
            {zones.map((zone) => {
              const zoneFactor = Math.min(1, Math.max(0, zone.percentage / 100));
              return [
                <div
                  key={`${zone.zone}-label`}
                  className="flex items-center text-xs font-semibold text-slate-400"
                >
                  {zone.zone}
                </div>,
                ...MARKET_HOURS.map(({ hour, weight }) => {
                  const intensity = zoneFactor * weight;
                  const estimated = Math.round(zone.density * weight);
                  return (
                    <div
                      key={`${zone.zone}-${hour}`}
                      title={`โซน ${zone.zone} • ${hour}:00 น. • ~${estimated.toLocaleString()} คน`}
                      className="flex items-center justify-center rounded-md text-[10px] tabular-nums text-white/70 transition-colors"
                      style={{ background: heatColor(intensity) }}
                    >
                      {estimated > 0 ? estimated.toLocaleString() : ""}
                    </div>
                  );
                }),
              ];
            })}

            {/* แถวชั่วโมง */}
            <div />
            {MARKET_HOURS.map(({ hour }) => (
              <div
                key={`h-${hour}`}
                className="flex items-center justify-center text-[10px] tabular-nums text-slate-600"
              >
                {hour}:00
              </div>
            ))}
          </div>

          {/* สรุปโซน + legend */}
          <div>
            <div className="space-y-1.5">
              {zones.map((zone) => (
                <div key={zone.zone} className="flex items-center gap-2 text-[11px]">
                  <span className="w-10 text-slate-500 font-thai">โซน {zone.zone}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, zone.percentage))}%` }}
                    />
                  </div>
                  <span className="w-9 text-right tabular-nums text-slate-500">
                    {zone.percentage}%
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-slate-600 font-thai">
              เบาบาง
              <span
                className="h-2 w-20 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(245,158,11,0.15), rgba(249,115,22,0.5), rgba(244,63,94,0.7))",
                }}
              />
              หนาแน่น
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
