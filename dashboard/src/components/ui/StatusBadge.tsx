import type { CrowdStatus } from "@/types";
import { STATUS_MAP } from "@/lib/utils";

interface StatusBadgeProps {
  status: CrowdStatus;
  pulse?: boolean;
}

export function StatusBadge({ status, pulse = false }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${cfg.bg} ${cfg.color} font-thai`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {cfg.label}
    </span>
  );
}
