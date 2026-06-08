/**
 * ZoneHeatmap — ความหนาแน่นตามโซน: แผนที่ดาวเทียม + การ์ดโซน A/B/C
 */
import { useState, useEffect } from 'react';
import { getZoneCurrent } from '../../services/api.jsx';
import { POLL_INTERVALS } from '../../lib/constants.js';
import ZoneCard from './ZoneCard';
import ZoneMap from './ZoneMap';
import ZoneUpdateModal from './ZoneUpdateModal';

export default function ZoneHeatmap({ isOfficer = false }) {
    const [zoneData, setZoneData] = useState(null);
    const [isStale, setIsStale] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchZones = async () => {
        try {
            const data = await getZoneCurrent();
            setZoneData(data);
            setIsStale(false);
        } catch {
            setIsStale(true);
        }
    };

    useEffect(() => {
        fetchZones();
        const id = setInterval(fetchZones, POLL_INTERVALS.ZONE_HEATMAP_MS);
        return () => clearInterval(id);
    }, []);

    if (!zoneData) {
        return (
            <section className="section">
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>
                    กำลังโหลดข้อมูลโซน...
                </div>
            </section>
        );
    }

    return (
        <section className="section">
            <div className="section-header">
                <h2 className="section-title">ความหนาแน่นตามโซน</h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {isStale && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--status-caution, #d69e2e)' }}>
                            ⚠ ข้อมูลเก่า
                        </span>
                    )}
                    {isOfficer && (
                        <button
                            onClick={() => setIsModalOpen(true)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: 'var(--border-radius, 8px)',
                                border: '1px solid var(--border-color, #e2e8f0)',
                                background: 'var(--bg-card, #fff)',
                                cursor: 'pointer',
                                fontSize: '0.8125rem',
                                fontWeight: 500,
                            }}
                        >
                            อัปเดตโซน
                        </button>
                    )}
                </div>
            </div>

            <ZoneMap zoneData={zoneData} />

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
            }}>
                {zoneData.zones.map((zone) => (
                    <ZoneCard key={zone.zone_code} zone={zone} />
                ))}
            </div>

            {zoneData.updated_by && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    อัปเดตโดย {zoneData.updated_by} · {new Date(zoneData.updated_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                </p>
            )}

            {isModalOpen && (
                <ZoneUpdateModal
                    currentZones={zoneData.zones}
                    onClose={() => setIsModalOpen(false)}
                    onSaved={() => { setIsModalOpen(false); fetchZones(); }}
                />
            )}
        </section>
    );
}
