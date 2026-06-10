import { Cctv, Plus, Video } from "lucide-react";
import type { CameraNode } from "@/types";

interface CCTVGridProps {
  cameras: CameraNode[];
}

function CCTVTile({ camera }: { camera: CameraNode }) {
  const online = camera.status === "online";

  return (
    <div className="group relative aspect-video overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-slate-800/80 to-slate-900">
      {/* เส้นสแกนแบบจอ NVR */}
      {online && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-scanline absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-cyan-400/[0.04] to-transparent" />
        </div>
      )}

      {/* ภาพกล้อง (placeholder จนกว่าจะต่อ WebRTC) */}
      <div className="absolute inset-0 flex items-center justify-center text-slate-700">
        <Video className="h-10 w-10 transition-colors group-hover:text-slate-600" />
      </div>

      {/* OSD บนซ้าย: REC + รหัสกล้อง */}
      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            online ? "animate-pulse bg-rose-500" : "bg-slate-600"
          }`}
        />
        <span className="font-mono text-[10px] tracking-wide text-slate-300">
          {camera.cameraId}
        </span>
      </div>

      {/* บนขวา: โซน + สถานะ */}
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
        <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
          ZONE {camera.zone}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
            online ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
          }`}
        >
          {online ? "ONLINE" : "OFFLINE"}
        </span>
      </div>

      {/* OSD ล่าง: ตัวเลขนับแบบ NVR */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-6">
        <div className="flex items-end justify-between">
          <div className="font-mono text-[10px] leading-relaxed text-emerald-400/90">
            <div>Enter:{camera.enter.toLocaleString()}</div>
            <div>Leave:{camera.leave.toLocaleString()}</div>
            <div>Duplicate:{camera.duplicate}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400 font-thai">{camera.labelTh}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CCTVGrid({ cameras }: CCTVGridProps) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200 font-thai">
          <Cctv className="h-4 w-4 text-amber-400" />
          กล้อง CCTV ({cameras.length} จุด)
        </h3>
        <span className="text-[11px] text-slate-500 font-thai">
          A1 แยกกลาง • B1 ฝั่งสะพานรัษฎา • B2 ตลาดเก่า
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cameras.map((cam) => (
          <CCTVTile key={cam.id} camera={cam} />
        ))}

        {/* จุดติดตั้งเพิ่มตามแผนขยายผล */}
        <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] text-slate-600">
          <Plus className="h-5 w-5" />
          <span className="text-[11px] font-thai">จุดติดตั้งเพิ่ม (แผนขยายผล)</span>
        </div>
      </div>
    </div>
  );
}
