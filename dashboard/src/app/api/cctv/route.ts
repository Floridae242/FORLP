import { NextResponse } from "next/server";
import { fetchDevices, fetchCctvUptime } from "@/lib/ioc";
import { buildCctvData } from "@/lib/cctv";

// always fetch fresh live status; never statically cached
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_KEYWORD = process.env.IOC_SITE_KEYWORD ?? "กาดกองต้า";

export async function GET() {
  try {
    const [devices, uptime] = await Promise.all([fetchDevices(), fetchCctvUptime()]);
    const data = buildCctvData(devices, uptime, SITE_KEYWORD);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "IOC fetch failed" },
      { status: 502 }
    );
  }
}
