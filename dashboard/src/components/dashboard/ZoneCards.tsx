import type { ZoneDensity } from "@/types";

const COLORS: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  normal:   { bg: "rgba(72, 187, 120, 0.06)", border: "rgba(72, 187, 120, 0.2)",  text: "#48bb78", bar: "#48bb78" },
  moderate: { bg: "rgba(245, 158, 11, 0.06)", border: "rgba(245, 158, 11, 0.2)",  text: "#f59e0b", bar: "#f59e0b" },
  busy:     { bg: "rgba(249, 115, 22, 0.06)", border: "rgba(249, 115, 22, 0.2)",  text: "#f97316", bar: "#f97316" },
  crowded:  { bg: "rgba(239, 68, 68, 0.06)",  border: "rgba(239, 68, 68, 0.2)",   text: "#ef4444", bar: "#ef4444" },
};

const ZONE_LABEL_TH: Record<string, string> = {
  normal: "เบาบาง", moderate: "ปกติ", busy: "ค่อนข้างแออัด", crowded: "แออัด",
};

function ZoneCard({ zone }: { zone: ZoneDensity }) {
  const c = COLORS[zone.status] ?? COLORS.normal;

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-2"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm" style={{ color: c.text }}>
          โซน {zone.zone}
        </span>
        <span className="text-xs text-white/40">{zone.label}</span>
      </div>

      <div className="text-2xl font-extrabold" style={{ color: c.text }}>
        {zone.density > 0 ? zone.density.toLocaleString() : "—"}{" "}
        <span className="text-sm font-normal">คน</span>
      </div>

      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, zone.percentage))}%`, background: c.bar }}
        />
      </div>

      <div className="flex justify-between text-xs">
        <span style={{ color: c.text }}>● {ZONE_LABEL_TH[zone.status] ?? zone.status}</span>
        <span className="text-white/40">{zone.percentage}%</span>
      </div>
    </div>
  );
}

export function ZoneCards({ zones }: { zones: ZoneDensity[] }) {
  if (!zones.length) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3 font-thai">
        ความหนาแน่นตามโซน
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {zones.map((z) => (
          <ZoneCard key={z.zone} zone={z} />
        ))}
      </div>
    </section>
  );
}
