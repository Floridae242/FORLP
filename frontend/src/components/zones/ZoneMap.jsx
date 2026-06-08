/**
 * ZoneMap — แผนที่ดาวเทียม Mapbox พร้อม polygon สีตามความหนาแน่นของแต่ละโซน
 */
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Polygon, Popup } from 'react-leaflet';
import { CROWD_COLORS, CROWD_OPACITY } from '../../lib/constants.js';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

if (!TOKEN) {
  console.warn('[ZoneMap] VITE_MAPBOX_TOKEN not set — falling back to OpenStreetMap tiles');
}
if (TOKEN && !TOKEN.startsWith('pk.')) {
  console.error('[ZoneMap] VITE_MAPBOX_TOKEN must be a public token (pk.*). Secret tokens must not be used here.');
}

const TILE_URL = TOKEN
  ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}?access_token=${TOKEN}`
  : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const TILE_ATTRIBUTION = TOKEN
  ? '© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const CENTER = [18.2914, 99.4991];
const DEFAULT_ZOOM = 17;

const ZONE_POLYGONS = {
  A: [
    [18.291538, 99.499776],
    [18.291850, 99.499588],
    [18.292505, 99.500804],
    [18.292193, 99.500992],
  ],
  B: [
    [18.290884, 99.498559],
    [18.291196, 99.498371],
    [18.291850, 99.499588],
    [18.291538, 99.499776],
  ],
  C: [
    [18.290230, 99.497342],
    [18.290542, 99.497154],
    [18.291196, 99.498371],
    [18.290884, 99.498559],
  ],
};

export function getCrowdColor(crowdLevel) {
  return CROWD_COLORS[crowdLevel] ?? CROWD_COLORS.unknown;
}

export default function ZoneMap({ zoneData }) {
  if (!zoneData) {
    return (
      <div style={{
        height: 200,
        background: '#f1f5f9',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        marginBottom: '1rem',
      }}>
        กำลังโหลดแผนที่...
      </div>
    );
  }

  return (
    <MapContainer
      center={CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: 200, width: '100%', borderRadius: 8, marginBottom: '1rem' }}
      scrollWheelZoom={false}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      {(zoneData.zones ?? []).map((zone) => {
        const coords = ZONE_POLYGONS[zone.zone_code];
        if (!coords) return null;
        const color = getCrowdColor(zone.crowd_level);
        const fillOpacity = CROWD_OPACITY[zone.crowd_level] ?? 0.25;
        return (
          <Polygon
            key={zone.zone_code}
            positions={coords}
            pathOptions={{ color, fillColor: color, fillOpacity, weight: 2 }}
          >
            <Popup>
              <strong>โซน {zone.zone_code} — {zone.name}</strong><br />
              สัดส่วน: {zone.percentage}%<br />
              ประมาณ: {zone.estimated_count != null ? `${zone.estimated_count} คน` : '—'}<br />
              ระดับ: {zone.crowd_label}
            </Popup>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
