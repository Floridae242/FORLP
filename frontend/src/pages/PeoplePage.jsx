import { useState, useEffect, useCallback, useMemo } from 'react';
import usePageTitle from '../hooks/usePageTitle';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
    getCurrentPeopleCount, getDailySummary, getHourlyData,
    getHistoricalData, isDataStale, sendLineNotification
} from '../services/api.jsx';
import { useAuth } from '../contexts/AuthContext';
import ZoneHeatmap from '../components/zones/ZoneHeatmap';

// =====================================================
// CONSTANTS — ปรับ threshold ตาม PDF เทศบาลนครลำปาง
// =====================================================
const THRESHOLDS = {
    NORMAL:   { min: 0,    max: 500,  key: 'normal',   label: 'ปกติ',       desc: 'สภาพปกติ ไหลลื่น' },
    MODERATE: { min: 501,  max: 1200, key: 'moderate',  label: 'ปานกลาง',   desc: 'ค่อนข้างคึกคัก' },
    BUSY:     { min: 1201, max: 2500, key: 'busy',      label: 'หนาแน่น',   desc: 'เริ่มแออัด ควรระวัง' },
    CROWDED:  { min: 2501, max: Infinity, key: 'crowded', label: 'หนาแน่นมาก', desc: 'แจ้งเตือนทันที' },
};

const WARNING_LINE = 2500; // เส้นแจ้งเตือนบน chart

// ข้อมูลจาก PDF Report เทศบาลนครลำปาง
const PDF_REPORT = {
    enter: 337,
    leave: 3161,
    reportDate: '2026-02-07', // Report Time ในรายงาน NVR (กล้อง LPG-B01-Temp-CC-01)
    source: 'รายงานเทศบาลนครลำปาง',
};

// =====================================================
// HELPERS
// =====================================================
function getStatus(count) {
    if (count >= THRESHOLDS.CROWDED.min) return THRESHOLDS.CROWDED;
    if (count >= THRESHOLDS.BUSY.min)    return THRESHOLDS.BUSY;
    if (count >= THRESHOLDS.MODERATE.min) return THRESHOLDS.MODERATE;
    return THRESHOLDS.NORMAL;
}

function fmtTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' น.';
}

function fmtDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtShortDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// สีตาม status
const STATUS_COLORS = {
    normal:   'var(--status-safe)',
    moderate: 'var(--status-info)',
    busy:     'var(--status-caution)',
    crowded:  'var(--status-danger)',
};

// =====================================================
// MINI SPARKLINE COMPONENT
// =====================================================
function Sparkline({ data, dataKey = 'max_people', width = 120, height = 36, color = 'var(--color-accent)' }) {
    if (!data || data.length < 2) return null;
    return (
        <ResponsiveContainer width={width} height={height}>
            <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
                      fill="url(#sparkGrad)" dot={false} isAnimationActive={false} />
            </AreaChart>
        </ResponsiveContainer>
    );
}

// =====================================================
// CUSTOM TOOLTIP
// =====================================================
function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.[0]) return null;
    return (
        <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius)', padding: '10px 14px',
            boxShadow: 'var(--shadow-elevated)', fontSize: '0.8125rem',
        }}>
            <p style={{ fontWeight: 600, color: 'var(--text-heading)', marginBottom: 4 }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color || 'var(--text-body)' }}>
                    {p.name}: <strong>{Number(p.value).toLocaleString()}</strong> คน
                </p>
            ))}
        </div>
    );
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function PeoplePage() {
    usePageTitle('ภาพรวมพื้นที่');
    const { canAccessCCTV } = useAuth();
    // ตรงกับ officerOnlyMiddleware ฝั่ง backend: ต้องเป็นเจ้าหน้าที่ที่ยืนยันสิทธิ์แล้ว
    const isOfficer = canAccessCCTV();
    const [currentData, setCurrentData] = useState(null);
    const [dailyData, setDailyData] = useState(null);
    const [hourlyData, setHourlyData] = useState([]);
    const [historyData, setHistoryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastFetch, setLastFetch] = useState(null);
    const [notifySending, setNotifySending] = useState(false);
    const [notifyResult, setNotifyResult] = useState(null);

    // ── Fetch ──────────────────────────────────────
    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const [current, daily, hourly, history] = await Promise.all([
                getCurrentPeopleCount(),
                getDailySummary(),
                getHourlyData().catch(() => []),
                getHistoricalData(7).catch(() => []),
            ]);
            setCurrentData(current);
            setDailyData(daily);
            setHourlyData(Array.isArray(hourly) ? hourly : []);
            setHistoryData(Array.isArray(history) ? history : []);
            setLastFetch(new Date().toISOString());
            setLoading(false);
        } catch (err) {
            console.error('[PeoplePage] Fetch error:', err.message);
            setError('ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่อีกครั้ง');
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const iv = setInterval(fetchData, 30_000);
        return () => clearInterval(iv);
    }, [fetchData]);

    // ── Derived ────────────────────────────────────
    const count      = currentData?.smoothed_count ?? currentData?.count ?? 0;
    const timestamp  = currentData?.timestamp || lastFetch;
    const isStale    = currentData?.is_stale || isDataStale(timestamp);
    const peakToday  = dailyData?.max_people ?? 0;
    const avgToday   = Math.round(dailyData?.avg_people ?? 0);
    const status     = getStatus(count);

    // Hourly chart data (label = ชั่วโมง)
    const hourlyChartData = useMemo(() =>
        hourlyData.map(h => ({
            name: `${String(h.hour).padStart(2, '0')}:00`,
            สูงสุด: h.max_people || 0,
            เฉลี่ย: Math.round(h.avg_people || 0),
        })),
    [hourlyData]);

    // History (7 days) reversed for chronological order
    const historyChartData = useMemo(() =>
        [...historyData].reverse().map(d => ({
            name: fmtShortDate(d.date),
            สูงสุด: d.max_people || 0,
            เฉลี่ย: Math.round(d.avg_people || 0),
        })),
    [historyData]);

    // progress % สำหรับ gauge bar
    const pct = Math.min((count / WARNING_LINE) * 100, 100);

    // ── LINE Notify ────────────────────────────────
    const handleNotify = async () => {
        setNotifySending(true);
        setNotifyResult(null);
        try {
            const msg = `แจ้งเตือนจำนวนคน — กาดกองต้า\n\nจำนวนผู้คนขณะนี้: ${count.toLocaleString()} คน\nสถานะ: ${status.label} (${status.desc})\nสูงสุดวันนี้: ${peakToday.toLocaleString()} คน\nเวลา: ${fmtTime(timestamp)}\n\n(ข้อมูลจากระบบอัตโนมัติ)`;
            const res = await sendLineNotification(msg, 'crowd_status');
            setNotifyResult(res.success ? 'sent' : 'fail');
        } catch {
            setNotifyResult('fail');
        } finally {
            setNotifySending(false);
            setTimeout(() => setNotifyResult(null), 4000);
        }
    };

    // ── Loading / Error ────────────────────────────
    if (loading && !currentData) {
        return (
            <div className="page-container">
                <header className="page-header">
                    <h1 className="page-title">ภาพรวมพื้นที่</h1>
                    <p className="page-subtitle">ถนนคนเดินกาดกองต้า เทศบาลนครลำปาง</p>
                </header>
                <div className="loading-container">
                    <div className="loading-spinner" />
                    <p className="loading-text">กำลังโหลดข้อมูล...</p>
                </div>
            </div>
        );
    }

    if (error && !currentData) {
        return (
            <div className="page-container">
                <header className="page-header">
                    <h1 className="page-title">ภาพรวมพื้นที่</h1>
                    <p className="page-subtitle">ถนนคนเดินกาดกองต้า เทศบาลนครลำปาง</p>
                </header>
                <div className="error-container">
                    <p className="error-text">{error}</p>
                    <button className="retry-btn" onClick={fetchData}>ลองใหม่</button>
                </div>
            </div>
        );
    }

    // ── RENDER ──────────────────────────────────────
    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">ภาพรวมพื้นที่</h1>
                <p className="page-subtitle">ถนนคนเดินกาดกองต้า เทศบาลนครลำปาง</p>
            </header>

            {/* Stale banner */}
            {isStale && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    padding: '0.75rem 1rem', background: 'var(--status-caution-bg)',
                    border: '1px solid var(--status-caution-border)', color: 'var(--status-caution)',
                    borderRadius: 'var(--border-radius)', fontSize: '0.875rem', marginBottom: '1rem',
                }}>
                    <span>ข้อมูลอาจไม่เป็นปัจจุบัน — อัปเดตล่าสุดเมื่อ {fmtTime(timestamp)}</span>
                </div>
            )}

            {/* วันที่ */}
            <div style={{
                textAlign: 'center', marginBottom: '1.5rem', padding: '0.75rem 1rem',
                background: 'var(--bg-card)', borderRadius: 'var(--border-radius)',
                border: '1px solid var(--border-color)',
            }}>
                <p style={{ fontSize: '0.9375rem', color: 'var(--text-body)', fontWeight: 500, margin: 0 }}>
                    {fmtDate(timestamp)}
                </p>
            </div>

            {/* ═══════ HERO COUNTER CARD ═══════ */}
            <div className="counter-card">
                <p className="counter-label">จำนวนผู้คนในพื้นที่ขณะนี้</p>

                <div className="counter-value-wrap">
                    <span className="counter-value">{count.toLocaleString()}</span>
                    <span className="counter-unit">คน</span>
                </div>

                <div className={`counter-status ${status.key}`}>{status.label}</div>
                <p className="counter-desc">{status.desc}</p>

                {/* Gauge Bar */}
                <div style={{ margin: '1.25rem auto 0', maxWidth: 360 }}>
                    <div style={{
                        height: 8, borderRadius: 4, background: 'var(--bg-subtle)', overflow: 'hidden',
                    }}>
                        <div style={{
                            height: '100%', width: `${pct}%`, borderRadius: 4,
                            background: pct >= 100 ? 'var(--status-danger)' : pct >= 48 ? 'var(--status-caution)' : 'var(--status-safe)',
                            transition: 'width 0.6s ease',
                        }} />
                    </div>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem',
                        color: 'var(--text-light)', marginTop: 4,
                    }}>
                        <span>0</span>
                        <span style={{ color: 'var(--status-danger)', fontWeight: 500 }}>
                            เกณฑ์แจ้งเตือน {WARNING_LINE.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* สถิติย่อยวันนี้ + Sparkline */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem',
                    marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)',
                }}>
                    <div style={{ background: 'var(--bg-muted)', borderRadius: 'var(--border-radius)', padding: '1rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-primary)', lineHeight: 1.2 }}>
                            {peakToday.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>สูงสุดวันนี้</div>
                        {hourlyChartData.length >= 2 && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                                <Sparkline data={hourlyChartData} dataKey="สูงสุด" color="var(--color-primary)" />
                            </div>
                        )}
                    </div>
                    <div style={{ background: 'var(--bg-muted)', borderRadius: 'var(--border-radius)', padding: '1rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-primary)', lineHeight: 1.2 }}>
                            {avgToday.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>เฉลี่ยวันนี้</div>
                        {hourlyChartData.length >= 2 && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                                <Sparkline data={hourlyChartData} dataKey="เฉลี่ย" color="var(--status-info)" />
                            </div>
                        )}
                    </div>
                </div>

                {/* LINE Notify Button — เจ้าหน้าที่ที่ยืนยันสิทธิ์แล้วเท่านั้น (ตรงกับ backend) */}
                {isOfficer && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <button
                        onClick={handleNotify}
                        disabled={notifySending}
                        style={{
                            fontFamily: 'var(--font-main)', fontSize: '0.875rem', fontWeight: 500,
                            color: '#fff', background: notifySending ? '#9ca3af' : '#06c755',
                            border: 'none', borderRadius: 'var(--border-radius)', padding: '10px 20px',
                            cursor: notifySending ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                        }}
                    >
                        {notifySending ? 'กำลังส่ง...' : 'แจ้งเตือนผ่าน LINE'}
                    </button>
                    {notifyResult === 'sent' && (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--status-safe)', marginTop: 6 }}>ส่งแจ้งเตือนสำเร็จ</p>
                    )}
                    {notifyResult === 'fail' && (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--status-danger)', marginTop: 6 }}>ส่งไม่สำเร็จ กรุณาลองใหม่</p>
                    )}
                </div>
                )}

                {/* Update info */}
                <div className="update-info">
                    <span>อัปเดตล่าสุด:</span>
                    <span className="update-time">{fmtTime(timestamp)}</span>
                    <span className="update-auto">• ข้อมูลจากระบบอัตโนมัติ</span>
                </div>
            </div>

            {/* ═══════ ZONE HEATMAP ═══════ */}
            <ZoneHeatmap isOfficer={isOfficer} />

            {/* ═══════ ข้อมูลอ้างอิงจาก PDF Report (ข้อมูลประวัติศาสตร์) ═══════ */}
            <section className="section" style={{ marginTop: '1.5rem' }}>
                <div className="section-header" style={{ marginBottom: '1rem' }}>
                    <h2 className="section-title">ข้อมูลอ้างอิงจากรายงานเทศบาล</h2>
                    <span style={{
                        fontSize: '0.75rem', fontWeight: 500,
                        background: 'var(--bg-subtle)', color: 'var(--text-muted)',
                        padding: '2px 8px', borderRadius: 99,
                    }}>
                        {new Date(PDF_REPORT.reportDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                </div>
                <div className="card">
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        ข้อมูลนับจำนวนผู้คนจากรายงานครั้งเดียว — ไม่ใช่ข้อมูล real-time
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                        <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--status-safe-bg)', borderRadius: 'var(--border-radius)' }}>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--status-safe)', fontWeight: 500, marginBottom: 4 }}>เข้า (Enter)</div>
                            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--status-safe)', lineHeight: 1.2 }}>
                                {PDF_REPORT.enter.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>คน</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--status-caution-bg)', borderRadius: 'var(--border-radius)' }}>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--status-caution)', fontWeight: 500, marginBottom: 4 }}>ออก (Leave)</div>
                            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--status-caution)', lineHeight: 1.2 }}>
                                {PDF_REPORT.leave.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>คน</div>
                        </div>
                    </div>
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-muted)', borderRadius: 'var(--border-radius)', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                            ผลต่าง (Leave − Enter): <strong style={{ color: 'var(--text-heading)' }}>
                                {(PDF_REPORT.leave - PDF_REPORT.enter).toLocaleString()}
                            </strong> คน
                        </span>
                        <br />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>ที่มา: {PDF_REPORT.source}</span>
                    </div>
                </div>
            </section>

            {/* ═══════ HOURLY AREA CHART ═══════ */}
            {hourlyChartData.length > 0 && (
                <section className="section" style={{ marginTop: '1.5rem' }}>
                    <h2 className="section-title" style={{ marginBottom: '1rem' }}>
                        จำนวนคนรายชั่วโมงวันนี้
                    </h2>
                    <div className="card" style={{ padding: '1rem 0.5rem 0.5rem 0' }}>
                        <ResponsiveContainer width="100%" height={240}>
                            <AreaChart data={hourlyChartData} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
                                <defs>
                                    <linearGradient id="gradMax" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                                    </linearGradient>
                                    <linearGradient id="gradAvg" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="var(--status-info)" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="var(--status-info)" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                <Tooltip content={<ChartTooltip />} />
                                <ReferenceLine y={WARNING_LINE} stroke="var(--status-danger)" strokeDasharray="4 4"
                                    label={{ value: `เกณฑ์ ${WARNING_LINE.toLocaleString()}`, fill: 'var(--status-danger)', fontSize: 11, position: 'right' }} />
                                <Area type="monotone" dataKey="สูงสุด" stroke="var(--color-primary)" strokeWidth={2}
                                    fill="url(#gradMax)" name="สูงสุด" dot={false} activeDot={{ r: 4 }} />
                                <Area type="monotone" dataKey="เฉลี่ย" stroke="var(--status-info)" strokeWidth={1.5}
                                    fill="url(#gradAvg)" name="เฉลี่ย" dot={false} activeDot={{ r: 3 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                        <div style={{
                            display: 'flex', justifyContent: 'center', gap: '1.5rem',
                            padding: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)',
                        }}>
                            <span><span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--color-primary)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />สูงสุด</span>
                            <span><span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--status-info)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />เฉลี่ย</span>
                            <span><span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--status-danger)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle', borderTop: '1px dashed var(--status-danger)' }} />เกณฑ์ 2,500</span>
                        </div>
                    </div>
                </section>
            )}

            {/* ═══════ 7-DAY HISTORY AREA CHART ═══════ */}
            {historyChartData.length > 1 && (
                <section className="section" style={{ marginTop: '1.5rem' }}>
                    <div className="section-header">
                        <h2 className="section-title">แนวโน้ม 7 วันย้อนหลัง</h2>
                        <span className="section-badge">{historyChartData.length} วัน</span>
                    </div>
                    <div className="card" style={{ padding: '1rem 0.5rem 0.5rem 0' }}>
                        <ResponsiveContainer width="100%" height={200}>
                            <AreaChart data={historyChartData} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
                                <defs>
                                    <linearGradient id="gradHist" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                <Tooltip content={<ChartTooltip />} />
                                <ReferenceLine y={WARNING_LINE} stroke="var(--status-danger)" strokeDasharray="4 4" />
                                <Area type="monotone" dataKey="สูงสุด" stroke="var(--color-accent)" strokeWidth={2}
                                    fill="url(#gradHist)" name="สูงสุด" dot={{ r: 3, fill: 'var(--color-accent)' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            {/* ═══════ THRESHOLD LEGEND ═══════ */}
            <section className="section" style={{ marginTop: '1.5rem' }}>
                <h2 className="section-title" style={{ marginBottom: '1rem' }}>
                    ความหมายของระดับความหนาแน่น
                </h2>
                <div className="status-legend">
                    <div className="legend-item">
                        <span className="legend-dot normal" />
                        <span>ปกติ (0–500 คน)</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot moderate" />
                        <span>ปานกลาง (501–1,200 คน)</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot busy" />
                        <span>หนาแน่น (1,201–2,500 คน)</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot crowded" />
                        <span>หนาแน่นมาก (&gt;2,500 คน)</span>
                    </div>
                </div>
            </section>

            {/* หมายเหตุ */}
            <div className="note-box">
                <p className="note-title">เกี่ยวกับข้อมูลนี้</p>
                <p className="note-text">
                    ข้อมูลประมวลผลจากกล้องวงจรปิดโดยระบบ AI อัตโนมัติ
                    ตัวเลขเป็นการประมาณการณ์เพื่อใช้ประกอบการตัดสินใจของเจ้าหน้าที่
                    ไม่ใช่ข้อมูลอ้างอิงทางกฎหมาย
                </p>
            </div>

            {/* Disclaimer */}
            <div className="disclaimer">
                <p className="disclaimer-text">
                    ระบบนับจำนวนคนอัตโนมัติ เทศบาลนครลำปาง<br />
                    ข้อมูลอาจมีความคลาดเคลื่อนตามสภาพแสงและมุมกล้อง
                </p>
            </div>
        </div>
    );
}
