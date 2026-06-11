import type { CameraNode } from "@/types";

// ─────────────────────────────────────────────────────
// Transform Lampang IOC device + uptime payloads into the
// dashboard's CameraNode model. Pure functions, no secrets,
// no network — safe to unit-test and import anywhere.
// ─────────────────────────────────────────────────────

export interface CctvData {
  cameras: CameraNode[]; // ทุกกล้องของไซต์ (สำหรับกริด CCTV)
  mapNodes: CameraNode[]; // 1 จุดต่อสถานที่ (สำหรับแผนที่)
  fetchedAt: string;
}

// สัดส่วน enter/leave รายโซน อ้างอิงรายงาน NVR วัน peak 02/07 (รวม 337/3,161)
// ใช้เป็นค่าอ้างอิงจนกว่าจะมี API นับคนรายกล้องแบบ real-time
export const PEAK_ZONE_SPLIT: Record<string, { enter: number; leave: number }> = {
  A1: { enter: 168, leave: 1581 },
  B1: { enter: 101, leave: 949 },
  B2: { enter: 68, leave: 631 },
};

interface RawDevice {
  device_name?: string;
  device_location?: string;
  device_type_name?: string;
  device_active?: boolean;
}
interface RawGroup {
  devices?: RawDevice[];
}
interface RawUptime {
  name?: string;
  status?: number;
}

/** "LPG-A01-CC-02" → location "A01", map-node id "A1" */
function parseCode(code: string): { location: string; nodeId: string } {
  const parts = code.split("-"); // [LPG, A01, CC, 02]
  const location = parts[1] ?? code;
  const letter = location.charAt(0);
  const num = parseInt(location.slice(1), 10);
  return { location, nodeId: Number.isNaN(num) ? location : `${letter}${num}` };
}

function parseLatLng(loc: string): { lat: number; lng: number } | null {
  const m = loc.split(",").map((s) => parseFloat(s.trim()));
  if (m.length < 2 || m.some((n) => Number.isNaN(n))) return null;
  return { lat: m[0], lng: m[1] };
}

function cleanLabel(raw: string): string {
  return raw
    .replace(/\(PTZ\)/gi, "")
    .replace(/\(Face\s*Rec\.?\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** map lat/lng of the site's points onto a schematic 0–100 canvas */
function computeXY(points: { lat: number; lng: number }[]): { x: number; y: number }[] {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;
  return points.map((p) => ({
    x: Math.round(15 + ((p.lng - minLng) / spanLng) * 70), // west→east 15..85
    y: Math.round(20 + ((maxLat - p.lat) / spanLat) * 60), // north(top)→south
  }));
}

export function buildCctvData(
  devicesPayload: unknown,
  uptimePayload: unknown,
  siteKeyword: string
): CctvData {
  const groups = Array.isArray(devicesPayload) ? (devicesPayload as RawGroup[]) : [];
  const uptimeList: RawUptime[] = Array.isArray(
    (uptimePayload as { data?: RawUptime[] })?.data
  )
    ? (uptimePayload as { data: RawUptime[] }).data
    : [];

  const statusByCode = new Map<string, boolean>();
  for (const u of uptimeList) {
    if (u.name) statusByCode.set(u.name.trim(), u.status === 1);
  }

  // flatten + filter to this site's CCTV cameras
  const raw = groups
    .flatMap((g) => g.devices ?? [])
    .filter(
      (d) =>
        d.device_type_name === "CCTV" &&
        typeof d.device_name === "string" &&
        d.device_name.includes(siteKeyword)
    );

  interface Parsed {
    code: string;
    location: string;
    nodeId: string;
    labelTh: string;
    coords: { lat: number; lng: number };
    ptz: boolean;
    faceRec: boolean;
    online: boolean;
    zone: string;
  }

  const parsed: Parsed[] = [];
  for (const d of raw) {
    const name = (d.device_name ?? "").trim();
    const code = name.split(/\s+/)[0];
    const coords = parseLatLng(d.device_location ?? "");
    if (!code || !coords) continue;
    const { location, nodeId } = parseCode(code);
    parsed.push({
      code,
      location,
      nodeId,
      labelTh: cleanLabel(name.slice(code.length)) || name,
      coords,
      ptz: /\(PTZ\)/i.test(name),
      faceRec: /Face\s*Rec/i.test(name),
      online: statusByCode.get(code) ?? d.device_active === true,
      zone: location.charAt(0),
    });
  }

  parsed.sort((a, b) => a.code.localeCompare(b.code));

  // mark one counting camera per location (first non-PTZ)
  const countingByLocation = new Set<string>();
  for (const p of parsed) {
    if (!p.ptz && !countingByLocation.has(p.location)) countingByLocation.add(p.location);
  }
  const isCounting = (p: Parsed) =>
    !p.ptz && countingByLocation.has(p.location) &&
    parsed.find((q) => q.location === p.location && !q.ptz)?.code === p.code;

  const xy = computeXY(parsed.map((p) => p.coords));

  const cameras: CameraNode[] = parsed.map((p, i) => {
    const counting = isCounting(p);
    const split = counting ? PEAK_ZONE_SPLIT[p.nodeId] : undefined;
    const enter = split?.enter ?? 0;
    const leave = split?.leave ?? 0;
    return {
      id: p.code,
      cameraId: p.code,
      label: p.labelTh,
      labelTh: p.labelTh,
      zone: p.zone,
      lat: p.coords.lat,
      lng: p.coords.lng,
      x: xy[i].x,
      y: xy[i].y,
      enter,
      leave,
      duplicate: 0,
      net: enter - leave,
      status: p.online ? "online" : "offline",
      ptz: p.ptz || undefined,
      faceRec: p.faceRec || undefined,
      counting: counting || undefined,
    };
  });

  // one node per location for the map (use the counting camera)
  const mapNodes: CameraNode[] = [];
  const seen = new Set<string>();
  for (const cam of cameras) {
    const loc = parseCode(cam.cameraId).location;
    if (seen.has(loc)) continue;
    const counter = cameras.find(
      (c) => parseCode(c.cameraId).location === loc && c.counting
    );
    const rep = counter ?? cam;
    const anyOnline = cameras.some(
      (c) => parseCode(c.cameraId).location === loc && c.status === "online"
    );
    mapNodes.push({
      ...rep,
      id: parseCode(rep.cameraId).nodeId,
      status: anyOnline ? "online" : "offline",
    });
    seen.add(loc);
  }

  return { cameras, mapNodes, fetchedAt: new Date().toISOString() };
}
