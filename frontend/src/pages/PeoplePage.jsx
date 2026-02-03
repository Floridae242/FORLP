import { useState, useEffect, useCallback } from 'react';
import { getCurrentPeopleCount, getDailySummary, isDataStale, formatStaleness } from '../services/api.jsx';

function getStatus(count) {
    if (count >= 600) return { 
        key: 'crowded', 
        label: 'หนาแน่นมาก', 
        desc: 'พื้นที่มีผู้คนหนาแน่น เจ้าหน้าที่ควรเฝ้าระวังเป็นพิเศษ',
        advice: 'แนะนำให้เจ้าหน้าที่เพิ่มจุดดูแลความปลอดภัย'
    };
    if (count >= 300) return { 
        key: 'busy', 
        label: 'ค่อนข้างหนาแน่น', 
        desc: 'มีผู้คนจำนวนมากในพื้นที่ สามารถเดินชมได้ตามปกติ',
        advice: 'สถานการณ์ปกติ ติดตามสถานการณ์ต่อเนื่อง'
    };
    if (count >= 100) return { 
        key: 'moderate', 
        label: 'ปานกลาง', 
        desc: 'มีผู้คนพอสมควร การสัญจรสะดวก',
        advice: 'สถานการณ์ปกติ ไม่ต้องดำเนินการเพิ่มเติม'
    };
    return { 
        key: 'normal', 
        label: 'ปกติ', 
        desc: 'พื้นที่โล่ง การสัญจรสะดวกมาก',
        advice: 'สถานการณ์ปกติ ไม่ต้องดำเนินการเพิ่มเติม'
    };
}

function formatTime(isoString) {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('th-TH', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
    }) + ' น.';
}

function formatDate(isoString) {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleDateString('th-TH', { 
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// Inline styles for additional components
const styles = {
    quickStats: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.75rem',
        marginTop: '1.5rem',
    },
    quickStatItem: {
        background: 'var(--bg-muted)',
        borderRadius: 'var(--border-radius)',
        padding: '1rem',
        textAlign: 'center',
    },
    quickStatValue: {
        fontSize: '1.5rem',
        fontWeight: '600',
        color: 'var(--color-primary)',
        lineHeight: 1.2,
    },
    quickStatLabel: {
        fontSize: '0.8125rem',
        color: 'var(--text-muted)',
        marginTop: '4px',
    },
    adviceBox: {
        marginTop: '1.5rem',
        padding: '1rem 1.25rem',
        background: 'var(--bg-muted)',
        borderRadius: 'var(--border-radius)',
        borderLeft: '3px solid var(--color-primary)',
    },
    adviceTitle: {
        fontSize: '0.8125rem',
        fontWeight: '600',
        color: 'var(--text-heading)',
        marginBottom: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    adviceText: {
        fontSize: '0.9375rem',
        color: 'var(--text-body)',
        margin: 0,
        lineHeight: 1.6,
    },
    dateDisplay: {
        textAlign: 'center',
        marginBottom: '1.5rem',
        padding: '0.75rem 1rem',
        background: 'var(--bg-card)',
        borderRadius: 'var(--border-radius)',
        border: '1px solid var(--border-color)',
    },
    dateText: {
        fontSize: '0.9375rem',
        color: 'var(--text-body)',
        fontWeight: '500',
        margin: 0,
    },
    trendIndicator: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.8125rem',
        padding: '4px 10px',
        borderRadius: 'var(--border-radius)',
        marginLeft: '0.5rem',
    },
    trendUp: {
        background: 'var(--status-caution-bg)',
        color: 'var(--status-caution)',
    },
    trendDown: {
        background: 'var(--status-safe-bg)',
        color: 'var(--status-safe)',
    },
    trendStable: {
        background: 'var(--status-info-bg)',
        color: 'var(--status-info)',
    },
    stalenessWarning: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        background: '#FEF3C7',
        color: '#92400E',
        borderRadius: 'var(--border-radius)',
        fontSize: '0.875rem',
        marginBottom: '1rem',
    },
    loadingState: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        color: 'var(--text-muted)',
    },
    errorState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        color: 'var(--status-danger)',
        textAlign: 'center',
    },
    retryButton: {
        marginTop: '1rem',
        padding: '0.5rem 1.5rem',
        background: 'var(--color-primary)',
        color: 'white',
        border: 'none',
        borderRadius: 'var(--border-radius)',
        cursor: 'pointer',
        fontSize: '0.875rem',
    },
    sourceIndicator: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.75rem',
        padding: '2px 8px',
        borderRadius: '4px',
        marginLeft: '0.5rem',
    },
    sourceAI: {
        background: '#D1FAE5',
        color: '#065F46',
    },
    sourceStale: {
        background: '#FEE2E2',
        color: '#991B1B',
    },
    sourceMock: {
        background: '#E5E7EB',
        color: '#4B5563',
    },
};

export default function PeoplePage() {
    const [currentData, setCurrentData] = useState(null);
    const [dailyData, setDailyData] = useState(null);
    const [previousCount, setPreviousCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastFetch, setLastFetch] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const [current, daily] = await Promise.all([
                getCurrentPeopleCount(),
                getDailySummary()
            ]);
            if (currentData?.count !== undefined) {
                setPreviousCount(currentData.count);
            }
            setCurrentData(current);
            setDailyData(daily);
            setLastFetch(new Date().toISOString());
            setLoading(false);
        } catch (err) {
            console.error('[PeoplePage] Fetch error:', err.message);
            setError(err.message);
            setLoading(false);
        }
    }, [currentData?.count]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const count = currentData?.smoothed_count ?? currentData?.count ?? 0;
    const timestamp = currentData?.timestamp || lastFetch;
    const isStale = currentData?.is_stale || isDataStale(timestamp);
    const source = currentData?.source || 'unknown';
    const sourceLatency = currentData?.source_latency_s || 0;

    const peakToday = dailyData?.max_people ?? 0;
    const avgToday = Math.round(dailyData?.avg_people ?? 0);

    const status = getStatus(count);

    const diff = count - previousCount;
    const getTrend = () => {
        if (diff > 20) return { label: 'เพิ่มขึ้น', style: styles.trendUp, icon: '↑' };
        if (diff < -20) return { label: 'ลดลง', style: styles.trendDown, icon: '↓' };
        return { label: 'คงที่', style: styles.trendStable, icon: '→' };
    };
    const trend = getTrend();

    const getSourceStyle = () => {
        if (source === 'stale') return styles.sourceStale;
        if (source === 'mock') return styles.sourceMock;
        return styles.sourceAI;
    };

    const getSourceLabel = () => {
        if (source === 'stale') return 'ข้อมูลเก่า';
        if (source === 'mock') return 'ทดสอบ';
        if (source === 'playback') return 'AI';
        if (source === 'near-realtime') return 'Live';
        return 'AI';
    };

    if (loading && !currentData) {
        return (
            <div className="page-container">
                <header className="page-header">
                    <h1 className="page-title">ภาพรวมพื้นที่</h1>
                    <p className="page-subtitle">ถนนคนเดินกาดกองต้า เทศบาลนครลำปาง</p>
                </header>
                <div style={styles.loadingState}>
                    <span>กำลังโหลดข้อมูล...</span>
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
                <div style={styles.errorState}>
                    <span>ไม่สามารถโหลดข้อมูลได้</span>
                    <p style={{ fontSize: '0.875rem', margin: '0.5rem 0' }}>{error}</p>
                    <button style={styles.retryButton} onClick={fetchData}>
                        ลองใหม่
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">ภาพรวมพื้นที่</h1>
                <p className="page-subtitle">ถนนคนเดินกาดกองต้า เทศบาลนครลำปาง</p>
            </header>

            {isStale && (
                <div style={styles.stalenessWarning}>
                    <span>ข้อมูลล่าสุด: {formatTime(timestamp)} — อาจล้าหลัง ({formatStaleness(sourceLatency)})</span>
                </div>
            )}

            <div style={styles.dateDisplay}>
                <p style={styles.dateText}>{formatDate(timestamp)}</p>
            </div>

            <div className="counter-card">
                <p className="counter-label">
                    จำนวนผู้คนในพื้นที่ขณะนี้
                    <span style={{ ...styles.sourceIndicator, ...getSourceStyle() }}>
                        {getSourceLabel()}
                    </span>
                </p>
                
                <div className="counter-value-wrap">
                    <span className="counter-value">{count.toLocaleString()}</span>
                    <span className="counter-unit">คน</span>
                    <span style={{ ...styles.trendIndicator, ...trend.style }}>
                        {trend.icon} {trend.label}
                    </span>
                </div>
                
                <div className={`counter-status ${status.key}`}>
                    {status.label}
                </div>
                
                <p className="counter-desc">{status.desc}</p>

                <div style={styles.quickStats}>
                    <div style={styles.quickStatItem}>
                        <div style={styles.quickStatValue}>{peakToday.toLocaleString()}</div>
                        <div style={styles.quickStatLabel}>สูงสุดวันนี้</div>
                    </div>
                    <div style={styles.quickStatItem}>
                        <div style={styles.quickStatValue}>{avgToday.toLocaleString()}</div>
                        <div style={styles.quickStatLabel}>เฉลี่ยวันนี้</div>
                    </div>
                    <div style={styles.quickStatItem}>
                        <div style={{ ...styles.quickStatValue, color: diff >= 0 ? 'var(--status-caution)' : 'var(--status-safe)' }}>
                            {diff >= 0 ? '+' : ''}{diff}
                        </div>
                        <div style={styles.quickStatLabel}>เทียบครั้งก่อน</div>
                    </div>
                </div>

                <div style={styles.adviceBox}>
                    <p style={styles.adviceTitle}>
                        คำแนะนำสำหรับเจ้าหน้าที่
                    </p>
                    <p style={styles.adviceText}>{status.advice}</p>
                </div>
                
                <div className="update-info">
                    <span>อัปเดตล่าสุด:</span>
                    <span className="update-time">{formatTime(timestamp)}</span>
                    <span className="update-auto">• อัปเดตอัตโนมัติทุก 30 วินาที</span>
                </div>
            </div>

            <section className="section" style={{ marginTop: '1.5rem' }}>
                <h2 className="section-title" style={{ marginBottom: '1rem' }}>ความหมายของระดับความหนาแน่น</h2>
                <div className="status-legend">
                    <div className="legend-item">
                        <span className="legend-dot normal"></span>
                        <span>ปกติ (0–99 คน)</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot moderate"></span>
                        <span>ปานกลาง (100–299 คน)</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot busy"></span>
                        <span>ค่อนข้างหนาแน่น (300–599 คน)</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot crowded"></span>
                        <span>หนาแน่นมาก (600+ คน)</span>
                    </div>
                </div>
            </section>

            <div className="note-box">
                <p className="note-title">หมายเหตุ</p>
                <p className="note-text">
                    ข้อมูลนี้ประมวลผลจากกล้อง AI โดยอัตโนมัติ ตัวเลขเป็นการประมาณการณ์<br />
                    ใช้เพื่อประกอบการตัดสินใจของเจ้าหน้าที่ ไม่ใช่ข้อมูลอ้างอิงทางกฎหมาย
                </p>
            </div>

            <div className="disclaimer">
                <p className="disclaimer-text">
                    ระบบนับจำนวนคนอัตโนมัติ เทศบาลนครลำปาง<br />
                    ข้อมูลอาจมีความคลาดเคลื่อนตามสภาพแสงและมุมกล้อง
                </p>
            </div>
        </div>
    );
}
