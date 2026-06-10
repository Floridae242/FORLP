"use client";

import { Cctv, MapPin } from "lucide-react";
import type { CameraNode } from "@/types";

interface LiveMapProps {
  cameras: CameraNode[];
  selectedCamera: string | null;
  onSelectCamera: (id: string | null) => void;
}

const ZONE_COLOR: Record<string, { dot: string; ring: string; text: string }> = {
  A: { dot: "bg-rose-500", ring: "bg-rose-500/40", text: "text-rose-400" },
  B: { dot: "bg-amber-500", ring: "bg-amber-500/40", text: "text-amber-400" },
  C: { dot: "bg-emerald-500", ring: "bg-emerald-500/40", text: "text-emerald-400" },
};

export function LiveMap({ cameras, selectedCamera, onSelectCamera }: LiveMapProps) {
  // เส้นถนนคนเดิน ลากผ่านตำแหน่งกล้องเรียงตามแกน x
  const sorted = [...cameras].sort((a, b) => a.x - b.x);
  const streetPath = sorted
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
    .join(" ");

  return (
    <div className="relative h-[400px] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
      {/* พื้นหลังตารางแบบ IOC */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* แม่น้ำวัง + ถนนคนเดิน */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M -2 14 C 25 8, 55 16, 102 8 L 102 -2 L -2 -2 Z"
          fill="rgba(6,182,212,0.10)"
        />
        <path
          d="M -2 14 C 25 8, 55 16, 102 8"
          fill="none"
          stroke="rgba(6,182,212,0.25)"
          strokeWidth="0.4"
        />
        {streetPath && (
          <path
            d={streetPath}
            fill="none"
            stroke="rgba(245,158,11,0.35)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {/* จุดกล้อง */}
      {cameras.map((cam) => {
        const c = ZONE_COLOR[cam.zone] ?? ZONE_COLOR.B;
        const isSelected = selectedCamera === cam.id;
        return (
          <div
            key={cam.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${cam.x}%`, top: `${cam.y}%` }}
          >
            <button
              onClick={() => onSelectCamera(isSelected ? null : cam.id)}
              aria-label={`กล้อง ${cam.id} — ${cam.labelTh}`}
              className="group relative flex h-8 w-8 items-center justify-center"
            >
              <span
                className={`absolute inline-flex h-6 w-6 animate-ping rounded-full ${c.ring} ${
                  cam.status === "online" ? "" : "hidden"
                }`}
              />
              <span
                className={`relative flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-lg transition-transform group-hover:scale-110 ${c.dot} ${
                  isSelected ? "ring-2 ring-white/60 scale-110" : ""
                }`}
              >
                {cam.id}
              </span>
            </button>

            {/* tooltip รายละเอียดกล้อง */}
            {isSelected && (
              <div className="animate-in absolute bottom-9 left-1/2 z-10 w-52 -translate-x-1/2 rounded-xl border border-white/[0.1] bg-[#1E293B]/95 p-3 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${c.text} font-thai`}>
                    {cam.labelTh}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      cam.status === "online" ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                  />
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">{cam.cameraId}</div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-sm font-semibold tabular-nums text-amber-400">
                      {cam.enter.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-500">Enter</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold tabular-nums text-orange-400">
                      {cam.leave.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-500">Leave</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold tabular-nums text-slate-300">
                      {cam.net.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-500">Net</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* หัวมุม: ชื่อแผนที่ */}
      <div className="absolute left-4 top-4 flex items-center gap-2 text-xs text-slate-400">
        <MapPin className="h-3.5 w-3.5 text-amber-400" />
        <span className="font-thai">แผนผังจุดติดตั้ง CCTV — ถนนคนเดินกาดกองต้า</span>
      </div>
      <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-medium tracking-widest text-emerald-400">
        <Cctv className="h-3 w-3" />
        LIVE TRACKING
      </div>

      {/* legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 rounded-lg bg-black/30 px-3 py-1.5 text-[10px] text-slate-400 font-thai">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" /> โซน A
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> โซน B
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-cyan-500/20 ring-1 ring-cyan-500/40" />{" "}
          แม่น้ำวัง
        </span>
      </div>
    </div>
  );
}
