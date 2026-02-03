import { useState, useEffect, useCallback } from 'react';
import { getCurrentPeopleCount, getDailySummary, isDataStale } from '../services/api.jsx';

// กำหนดสถานะความหนาแน่นตามจำนวนคน
function getStatus(count) {
    if (count >= 600) return { 
        key: 'crowded', 
        label: 'หนาแน่นมาก', 
        desc: 'พื้นที่มีผู้คนหนาแน่น ควรระมัดระวังในการเดินทาง',
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
        advice: 'สถานการณ์ปกติ'
    };
    return { 
        key: 'normal', 
        label: 'ปกติ', 
        desc: 'พื้นที่โล่ง การสัญจรสะดวกมาก',
        advice: 'สถานการณ์ปกติ'
    };
}

// แปลงเวลาเป็นรูปแบบไทย
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

export default function PeoplePage() {
    const [currentData, setCurrentData] = useState(null);
    const [dailyData, setDailyData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastFetch, setLastFetch] = useState(null);

    // ดึงข้อมูลจาก Backend API
    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const [current, daily] = await Promise.all([
                getCurrentPeopleCount(),
                getDailySummary()
            ]);
            setCurrentData(current);
            setDailyData(daily);
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
        // อัปเดตอัตโนมัติทุก 30 วินาที
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // ค่าที่จะแสดง
    const count = currentData?.smoothed_count ?? currentData?.count ?? 0;
    const timestamp = currentData?.timestamp || lastFetch;
    const isStale = currentData?.is_stale || isDataStale(timestamp);
    const peakToday = dailyData?.max_people ?? 0;
    const avgToday = Math.round(dailyData?.avg_people ?? 0);
    const status = getStatus(count);

    // Loading State
    if (loading && !currentData) {
        return (
            <div className="page-container">
                <header className="page-header">
                    <h1 className="page-title">ภาพรวมพื้นที่</h1>
                    <p className="page-subtitle">ถนนคนเดินกาดกองต้า เทศบาลนครลำปาง</p>
                </header>
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p className="loading-text">กำลังโหลดข้อมูล...</p>
                </div>
            </div>
        );
    }

    // Error State
    if (error && !currentData) {
        return (
            <div className="page-container">
                <header className="page-header">
                    <h1 className="page-title">ภาพรวมพื้นที่</h1>
                    <p className="page-subtitle">ถนนคนเดินกาดกองต้า เทศบาลนครลำปาง</p>
                </header>
                <div className="error-container">
                    <p className="error-text">{error}</p>
                    <button className="retry-btn" onClick={fetchData}>
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

            {/* แจ้งเตือนถ้าข้อมูลล่าช้า */}
            {isStale && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1rem',
                    background: 'var(--status-caution-bg)',
                    border: '1px solid var(--status-caution-border)',
                    color: 'var(--status-caution)',
                    borderRadius: 'var(--border-radius)',
                    fontSize: '0.875rem',
                    marginBottom: '1rem',
                }}>
                    <span>⏱</span>
                    <span>ข้อมูลอาจไม่เป็นปัจจุบัน — อัปเดตล่าสุดเมื่อ {formatTime(timestamp)}</span>
                </div>
            )}

            {/* วันที่ */}
            <div style={{
                textAlign: 'center',
                marginBottom: '1.5rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-card)',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--border-color)',
            }}>
                <p style={{
                    fontSize: '0.9375rem',
                    color: 'var(--text-body)',
                    fontWeight: '500',
                    margin: 0,
                }}>
                    {formatDate(timestamp)}
                </p>
            </div>

            {/* การ์ดหลัก - จำนวนคน */}
            <div className="counter-card">
                <p className="counter-label">
                    จำนวนผู้คนในพื้นที่ขณะนี้
                </p>
                
                <div className="counter-value-wrap">
                    <span className="counter-value">{count.toLocaleString()}</span>
                    <span className="counter-unit">คน</span>
                </div>
                
                <div className={`counter-status ${status.key}`}>
                    {status.label}
                </div>
                
                <p className="counter-desc">{status.desc}</p>

                {/* สถิติย่อยวันนี้ */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '0.75rem',
                    marginTop: '1.5rem',
                    paddingTop: '1.5rem',
                    borderTop: '1px solid var(--border-color)',
                }}>
                    <div style={{
                        background: 'var(--bg-muted)',
                        borderRadius: 'var(--border-radius)',
                        padding: '1rem',
                        textAlign: 'center',
                    }}>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: '600',
                            color: 'var(--color-primary)',
                            lineHeight: 1.2,
                        }}>
                            {peakToday.toLocaleString()}
                        </div>
                        <div style={{
                            fontSize: '0.8125rem',
                            color: 'var(--text-muted)',
                            marginTop: '4px',
                        }}>
                            สูงสุดวันนี้
                        </div>
                    </div>
                    <div style={{
                        background: 'var(--bg-muted)',
                        borderRadius: 'var(--border-radius)',
                        padding: '1rem',
                        textAlign: 'center',
                    }}>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: '600',
                            color: 'var(--color-primary)',
                            lineHeight: 1.2,
                        }}>
                            {avgToday.toLocaleString()}
                        </div>
                        <div style={{
                            fontSize: '0.8125rem',
                            color: 'var(--text-muted)',
                            marginTop: '4px',
                        }}>
                            เฉลี่ยวันนี้
                        </div>
                    </div>
                </div>

                {/* เวลาอัปเดต */}
                <div className="update-info">
                    <span>อัปเดตล่าสุด:</span>
                    <span className="update-time">{formatTime(timestamp)}</span>
                    <span className="update-auto">• ข้อมูลจากระบบอัตโนมัติ</span>
                </div>
            </div>

            {/* คำอธิบายระดับความหนาแน่น */}
            <section className="section" style={{ marginTop: '1.5rem' }}>
                <h2 className="section-title" style={{ marginBottom: '1rem' }}>
                    ความหมายของระดับความหนาแน่น
                </h2>
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
