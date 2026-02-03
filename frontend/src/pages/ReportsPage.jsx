import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://forlp-production.up.railway.app';

function isWeekend(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6;
}

function getLastWeekendDate() {
    const today = new Date();
    const day = today.getDay();
    
    if (day === 0 || day === 6) {
        return today.toISOString().split('T')[0];
    }
    
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - day);
    return lastSunday.toISOString().split('T')[0];
}

function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { 
        day: 'numeric', 
        month: 'short'
    });
}

function formatDateFull(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { 
        weekday: 'long',
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
    });
}

function getDayName(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 ? 'อาทิตย์' : day === 6 ? 'เสาร์' : '-';
}

function formatWeekRange(startDate, endDate) {
    if (!startDate) return '-';
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : start;
    
    const startStr = start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    const endStr = end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    
    return startDate === endDate ? startStr : `${startStr} - ${endStr}`;
}

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState('daily');
    const [selectedDate, setSelectedDate] = useState(getLastWeekendDate());
    
    const [dailyData, setDailyData] = useState(null);
    const [weeklyData, setWeeklyData] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const isClosed = !isWeekend(selectedDate);

    const fetchDailyData = useCallback(async (date) => {
        if (!isWeekend(date)) {
            setDailyData(null);
            return;
        }
        
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/people/daily?date=${date}`);
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
            
            const data = await response.json();
            if (data.success) {
                setDailyData(data.data);
            } else {
                setDailyData(null);
            }
        } catch (err) {
            console.error('[ReportsPage] Daily data error:', err);
            setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
            setDailyData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchWeeklyData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/reports/weekly`);
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
            
            const data = await response.json();
            if (data.success) {
                setWeeklyData(data.data);
            }
        } catch (err) {
            console.error('[ReportsPage] Weekly data error:', err);
            setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchHistoryData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/people/history?days=60`);
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
            
            const data = await response.json();
            if (data.success) {
                // Filter เฉพาะวันเสาร์-อาทิตย์
                const weekendOnly = (data.data || []).filter(day => isWeekend(day.date));
                setHistoryData(weekendOnly);
            }
        } catch (err) {
            console.error('[ReportsPage] History data error:', err);
            setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'daily') {
            fetchDailyData(selectedDate);
        } else if (activeTab === 'weekly') {
            fetchWeeklyData();
        } else if (activeTab === 'history') {
            fetchHistoryData();
        }
    }, [activeTab, selectedDate, fetchDailyData, fetchWeeklyData, fetchHistoryData]);

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">รายงานข้อมูล</h1>
                <p className="page-subtitle">สรุปจำนวนผู้คนในพื้นที่ถนนคนเดินกาดกองต้า</p>
            </header>

            <div className="report-tabs">
                <button 
                    className={`report-tab ${activeTab === 'daily' ? 'report-tab-active' : ''}`}
                    onClick={() => setActiveTab('daily')}
                >
                    รายวัน
                </button>
                <button 
                    className={`report-tab ${activeTab === 'weekly' ? 'report-tab-active' : ''}`}
                    onClick={() => setActiveTab('weekly')}
                >
                    สรุปรายสัปดาห์
                </button>
                <button 
                    className={`report-tab ${activeTab === 'history' ? 'report-tab-active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    ประวัติย้อนหลัง
                </button>
            </div>

            {loading && (
                <div className="loading-container" style={{ minHeight: '20vh' }}>
                    <div className="loading-spinner"></div>
                    <p className="loading-text">กำลังโหลดข้อมูล...</p>
                </div>
            )}

            {error && !loading && (
                <div className="error-container">
                    <p className="error-text">{error}</p>
                </div>
            )}

            {/* ==================== TAB: รายวัน ==================== */}
            {activeTab === 'daily' && !loading && (
                <section className="section">
                    <div className="date-picker">
                        <label>เลือกวันที่:</label>
                        <input 
                            type="date" 
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                        />
                    </div>

                    <p style={{ 
                        fontSize: '0.9375rem', 
                        color: 'var(--text-muted)', 
                        marginBottom: '1rem' 
                    }}>
                        {formatDateFull(selectedDate)}
                    </p>

                    {isClosed ? (
                        <div className="empty-state">
                            <p className="empty-text" style={{ marginBottom: '0.5rem' }}>
                                ตลาดปิดทำการในวันนี้
                            </p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                                ตลาดกาดกองต้าเปิดเฉพาะวันเสาร์และวันอาทิตย์ เวลา 16.00 - 22.00 น.
                            </p>
                        </div>
                    ) : dailyData ? (
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-value">
                                    {dailyData.max_people || 0}
                                    <span className="stat-unit"> คน</span>
                                </div>
                                <div className="stat-label">จำนวนสูงสุด</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">
                                    {Math.round(dailyData.avg_people || 0)}
                                    <span className="stat-unit"> คน</span>
                                </div>
                                <div className="stat-label">จำนวนเฉลี่ย</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">
                                    {dailyData.min_people || 0}
                                    <span className="stat-unit"> คน</span>
                                </div>
                                <div className="stat-label">จำนวนต่ำสุด</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">
                                    {dailyData.total_samples || 0}
                                </div>
                                <div className="stat-label">ครั้งที่บันทึก</div>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p className="empty-text">ไม่มีข้อมูลสำหรับวันที่เลือก</p>
                        </div>
                    )}
                </section>
            )}

            {/* ==================== TAB: สรุปรายสัปดาห์ ==================== */}
            {activeTab === 'weekly' && !loading && (
                <section className="section">
                    {/* Overall Summary */}
                    {weeklyData?.summary && (
                        <>
                            <div className="section-header">
                                <h3 className="section-title">📊 สรุปภาพรวม</h3>
                                <span className="section-badge">
                                    {weeklyData.summary.total_days} วันที่เปิดตลาด
                                </span>
                            </div>
                            
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {weeklyData.summary.total_weeks || 0}
                                        <span className="stat-unit"> สัปดาห์</span>
                                    </div>
                                    <div className="stat-label">สัปดาห์ที่บันทึก</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {weeklyData.summary.max_people_ever || 0}
                                        <span className="stat-unit"> คน</span>
                                    </div>
                                    <div className="stat-label">สูงสุดตลอดกาล</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {weeklyData.summary.avg_people_overall || 0}
                                        <span className="stat-unit"> คน</span>
                                    </div>
                                    <div className="stat-label">เฉลี่ยต่อวัน</div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Weekly Breakdown */}
                    <div className="section-header" style={{ marginTop: '1.5rem' }}>
                        <h3 className="section-title">📅 รายละเอียดแต่ละสัปดาห์</h3>
                    </div>
                    
                    {weeklyData?.weeks?.length > 0 ? (
                        <div className="weekly-list">
                            {weeklyData.weeks.map((week, i) => (
                                <div key={week.week_key} className="weekly-card" style={{
                                    background: 'var(--card-bg)',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                    marginBottom: '1rem',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    {/* Week Header */}
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: '0.75rem'
                                    }}>
                                        <div>
                                            <span style={{ 
                                                fontSize: '1rem',
                                                fontWeight: '600',
                                                color: 'var(--text-primary)'
                                            }}>
                                                สัปดาห์ที่ {week.week_number}
                                            </span>
                                            <span style={{ 
                                                fontSize: '0.8125rem',
                                                color: 'var(--text-muted)',
                                                marginLeft: '0.5rem'
                                            }}>
                                                ({formatWeekRange(week.start_date, week.end_date)})
                                            </span>
                                        </div>
                                        <span style={{
                                            background: 'var(--primary-light)',
                                            color: 'var(--primary)',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '6px',
                                            fontSize: '0.75rem',
                                            fontWeight: '500'
                                        }}>
                                            {week.days_open} วัน
                                        </span>
                                    </div>

                                    {/* Week Stats */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, 1fr)',
                                        gap: '0.75rem',
                                        marginBottom: '0.75rem'
                                    }}>
                                        <div style={{
                                            background: 'var(--bg-secondary)',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            textAlign: 'center'
                                        }}>
                                            <div style={{ 
                                                fontSize: '1.25rem', 
                                                fontWeight: '700',
                                                color: 'var(--primary)'
                                            }}>
                                                {week.max_people}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                สูงสุด
                                            </div>
                                        </div>
                                        <div style={{
                                            background: 'var(--bg-secondary)',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            textAlign: 'center'
                                        }}>
                                            <div style={{ 
                                                fontSize: '1.25rem', 
                                                fontWeight: '700',
                                                color: 'var(--text-primary)'
                                            }}>
                                                {week.avg_people}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                เฉลี่ย
                                            </div>
                                        </div>
                                    </div>

                                    {/* Saturday & Sunday Details */}
                                    <div style={{
                                        display: 'flex',
                                        gap: '0.5rem',
                                        fontSize: '0.8125rem'
                                    }}>
                                        {week.saturday && (
                                            <div style={{
                                                flex: 1,
                                                background: '#fef3c7',
                                                padding: '0.5rem',
                                                borderRadius: '6px',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontWeight: '500', color: '#92400e' }}>
                                                    🟡 เสาร์
                                                </div>
                                                <div style={{ color: '#b45309' }}>
                                                    สูงสุด {week.saturday.max_people} คน
                                                </div>
                                            </div>
                                        )}
                                        {week.sunday && (
                                            <div style={{
                                                flex: 1,
                                                background: '#fce7f3',
                                                padding: '0.5rem',
                                                borderRadius: '6px',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontWeight: '500', color: '#9d174d' }}>
                                                    🔴 อาทิตย์
                                                </div>
                                                <div style={{ color: '#be185d' }}>
                                                    สูงสุด {week.sunday.max_people} คน
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p className="empty-text">ยังไม่มีข้อมูลสรุปรายสัปดาห์</p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                                ข้อมูลจะแสดงเมื่อมีการบันทึกในวันเสาร์-อาทิตย์
                            </p>
                        </div>
                    )}
                </section>
            )}

            {/* ==================== TAB: ประวัติย้อนหลัง ==================== */}
            {activeTab === 'history' && !loading && (
                <section className="section">
                    <div className="section-header">
                        <h3 className="section-title">ประวัติวันที่เปิดตลาด</h3>
                        <span className="section-badge">{historyData.length} วัน</span>
                    </div>

                    <p style={{ 
                        fontSize: '0.875rem', 
                        color: 'var(--text-muted)', 
                        marginBottom: '1rem' 
                    }}>
                        แสดงเฉพาะวันเสาร์และวันอาทิตย์ที่ตลาดเปิดทำการ
                    </p>

                    {historyData.length > 0 ? (
                        <div className="history-list">
                            {historyData.map((day, i) => (
                                <div key={i} className="history-item">
                                    <div className="history-date">
                                        {formatDateShort(day.date)}
                                        <span style={{ 
                                            fontSize: '0.75rem', 
                                            color: getDayName(day.date) === 'เสาร์' ? '#b45309' : '#be185d',
                                            display: 'block',
                                            fontWeight: '500'
                                        }}>
                                            {getDayName(day.date)}
                                        </span>
                                    </div>
                                    <div className="history-stats">
                                        สูงสุด <strong>{day.max_people || 0}</strong> • 
                                        เฉลี่ย <strong>{Math.round(day.avg_people || 0)}</strong> • 
                                        ต่ำสุด <strong>{day.min_people || 0}</strong> คน
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p className="empty-text">ยังไม่มีข้อมูลประวัติ</p>
                        </div>
                    )}
                </section>
            )}

            {/* Note Box */}
            <div className="note-box">
                <p className="note-title">📌 เกี่ยวกับข้อมูล</p>
                <p className="note-text">
                    ตลาดกาดกองต้าเปิดทำการเฉพาะ <strong>วันเสาร์และวันอาทิตย์</strong> เวลา 16.00 - 22.00 น. 
                    ข้อมูลถูกบันทึกโดยระบบ AI อัตโนมัติ
                </p>
            </div>

            <div className="disclaimer">
                <p className="disclaimer-text">
                    ข้อมูลนี้เป็นการประเมินจากระบบอัตโนมัติ อาจมีความคลาดเคลื่อนจากจำนวนจริง
                </p>
            </div>
        </div>
    );
}
