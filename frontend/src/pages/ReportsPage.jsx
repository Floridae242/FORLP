import { useState, useEffect, useCallback } from 'react';
import usePageTitle from '../hooks/usePageTitle';

const API_BASE = import.meta.env.VITE_API_URL || 'https://forlp.onrender.com';

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

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPrevMonth(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 2, 1); // m-2 = เดือนก่อนหน้า (index)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthStr) {
    if (!monthStr) return '-';
    const [y, m] = monthStr.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

function formatMonthShort(monthStr) {
    if (!monthStr) return '-';
    const [y, m] = monthStr.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}

function formatNumber(n) {
    return Math.round(n || 0).toLocaleString('th-TH');
}

export default function ReportsPage() {
    usePageTitle('รายงานข้อมูล');
    const [activeTab, setActiveTab] = useState('daily');
    const [selectedDate, setSelectedDate] = useState(getLastWeekendDate());

    const currentMonth = getCurrentMonth();
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [month1, setMonth1] = useState(getPrevMonth(currentMonth));
    const [month2, setMonth2] = useState(currentMonth);

    const [dailyData, setDailyData] = useState(null);
    const [weeklyData, setWeeklyData] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [monthlyData, setMonthlyData] = useState(null);
    const [compareData, setCompareData] = useState(null);
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

    const fetchMonthlyData = useCallback(async (month) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/reports/monthly?month=${month}`);
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');

            const data = await response.json();
            if (data.success) {
                setMonthlyData(data.data);
            } else {
                setMonthlyData(null);
            }
        } catch (err) {
            console.error('[ReportsPage] Monthly data error:', err);
            setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
            setMonthlyData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchCompareData = useCallback(async (m1, m2) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/reports/compare?month1=${m1}&month2=${m2}`);
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');

            const data = await response.json();
            if (data.success) {
                setCompareData(data.data);
            } else {
                setCompareData(null);
            }
        } catch (err) {
            console.error('[ReportsPage] Compare data error:', err);
            setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
            setCompareData(null);
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
        } else if (activeTab === 'monthly') {
            fetchMonthlyData(selectedMonth);
        } else if (activeTab === 'compare') {
            fetchCompareData(month1, month2);
        }
    }, [activeTab, selectedDate, selectedMonth, month1, month2,
        fetchDailyData, fetchWeeklyData, fetchHistoryData, fetchMonthlyData, fetchCompareData]);

    // helper สำหรับการ์ดแสดงการเปลี่ยนแปลง (แท็บเปรียบเทียบ)
    const renderDelta = (label, d, unit = '') => {
        if (!d) return null;
        const up = d.change > 0;
        const down = d.change < 0;
        const cls = up ? 'delta-up' : down ? 'delta-down' : 'delta-flat';
        const arrow = up ? '▲' : down ? '▼' : '—';
        const sign = d.change > 0 ? '+' : '';
        return (
            <div className="delta-card" key={label}>
                <div className="delta-label">{label}</div>
                <div className="delta-values">
                    {formatNumber(d.from)} → {formatNumber(d.to)}{unit}
                </div>
                <div className={`delta-change ${cls}`}>
                    {arrow} {sign}{formatNumber(d.change)}{unit} ({sign}{d.change_pct}%)
                </div>
            </div>
        );
    };

    // helper สำหรับแถบเปรียบเทียบ 2 เดือน (1 ตัวชี้วัด)
    const renderCompareMetric = (label, v1, v2, unit = '') => {
        const maxV = Math.max(v1 || 0, v2 || 0, 1);
        return (
            <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.5rem' }}>
                    {label}
                </div>
                <div className="report-bars" style={{ marginBottom: 0 }}>
                    <div className="report-bar-row">
                        <span className="report-bar-label">{formatMonthShort(month1)}</span>
                        <div className="report-bar-track">
                            <div className="report-bar-fill" style={{ width: `${Math.max(((v1 || 0) / maxV) * 100, 2)}%` }}></div>
                        </div>
                        <span className="report-bar-value">{formatNumber(v1)}{unit}</span>
                    </div>
                    <div className="report-bar-row">
                        <span className="report-bar-label">{formatMonthShort(month2)}</span>
                        <div className="report-bar-track">
                            <div className="report-bar-fill" style={{ width: `${Math.max(((v2 || 0) / maxV) * 100, 2)}%`, background: 'var(--color-accent)' }}></div>
                        </div>
                        <span className="report-bar-value">{formatNumber(v2)}{unit}</span>
                    </div>
                </div>
            </div>
        );
    };

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
                <button
                    className={`report-tab ${activeTab === 'monthly' ? 'report-tab-active' : ''}`}
                    onClick={() => setActiveTab('monthly')}
                >
                    รายเดือน
                </button>
                <button
                    className={`report-tab ${activeTab === 'compare' ? 'report-tab-active' : ''}`}
                    onClick={() => setActiveTab('compare')}
                >
                    เปรียบเทียบ
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
                                <h3 className="section-title">สรุปภาพรวม</h3>
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
                        <h3 className="section-title">รายละเอียดแต่ละสัปดาห์</h3>
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
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                                            {week.market_hours && (
                                                <span style={{
                                                    background: '#fef3c7',
                                                    color: '#92400e',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '500'
                                                }}>
                                                    {week.market_hours}
                                                </span>
                                            )}
                                        </div>
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
                                                    เสาร์
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
                                                    อาทิตย์
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
                                ข้อมูลจะแสดงเมื่อมีการบันทึกในวันเสาร์-อาทิตย์ ช่วงเวลา 16:00-22:00 น.
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

            {/* ==================== TAB: รายเดือน ==================== */}
            {activeTab === 'monthly' && !loading && (
                <section className="section">
                    <div className="date-picker">
                        <label>เลือกเดือน:</label>
                        <input
                            type="month"
                            value={selectedMonth}
                            max={currentMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                        />
                    </div>

                    <p style={{ fontSize: '0.9375rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                        {formatMonthLabel(selectedMonth)}
                    </p>

                    {monthlyData ? (
                        <>
                            {/* สรุปจำนวนผู้คน */}
                            <div className="section-header">
                                <h3 className="section-title">สรุปจำนวนผู้คน</h3>
                                <span className="section-badge">
                                    {monthlyData.people?.days_with_data || 0} วันที่มีข้อมูล
                                </span>
                            </div>
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {formatNumber(monthlyData.people?.max_people)}
                                        <span className="stat-unit"> คน</span>
                                    </div>
                                    <div className="stat-label">สูงสุด</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {formatNumber(monthlyData.people?.avg_people)}
                                        <span className="stat-unit"> คน</span>
                                    </div>
                                    <div className="stat-label">เฉลี่ย</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {formatNumber(monthlyData.people?.min_people)}
                                        <span className="stat-unit"> คน</span>
                                    </div>
                                    <div className="stat-label">ต่ำสุด</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {formatNumber(monthlyData.people?.total_samples)}
                                    </div>
                                    <div className="stat-label">จำนวนครั้งที่บันทึก</div>
                                </div>
                            </div>

                            {/* รายวันในเดือน */}
                            <div className="section-header" style={{ marginTop: '1.5rem' }}>
                                <h3 className="section-title">รายวันในเดือนนี้</h3>
                            </div>
                            {monthlyData.daily?.length > 0 ? (
                                <div className="report-bars">
                                    {(() => {
                                        const maxVal = Math.max(...monthlyData.daily.map(d => d.max_people || 0), 1);
                                        return monthlyData.daily.map((d) => (
                                            <div key={d.date} className="report-bar-row">
                                                <span className="report-bar-label">{formatDateShort(d.date)}</span>
                                                <div className="report-bar-track">
                                                    <div className="report-bar-fill" style={{ width: `${Math.max(((d.max_people || 0) / maxVal) * 100, 2)}%` }}></div>
                                                </div>
                                                <span className="report-bar-value">{formatNumber(d.max_people)} คน</span>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <p className="empty-text">ไม่มีข้อมูลรายวันในเดือนนี้</p>
                                </div>
                            )}

                            {/* จุดเสี่ยงที่แจ้งเข้ามา */}
                            <div className="section-header" style={{ marginTop: '1.5rem' }}>
                                <h3 className="section-title">จุดเสี่ยงที่แจ้งเข้ามา</h3>
                                <span className="section-badge">
                                    {monthlyData.safety_reports?.total || 0} รายการ
                                </span>
                            </div>
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-value">{monthlyData.safety_reports?.pending || 0}</div>
                                    <div className="stat-label">รอดำเนินการ</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">{monthlyData.safety_reports?.in_progress || 0}</div>
                                    <div className="stat-label">กำลังแก้ไข</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">{monthlyData.safety_reports?.resolved || 0}</div>
                                    <div className="stat-label">แก้ไขแล้ว</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">{monthlyData.safety_reports?.rejected || 0}</div>
                                    <div className="stat-label">ปฏิเสธ</div>
                                </div>
                            </div>
                            {monthlyData.safety_reports?.by_type?.length > 0 && (
                                <div className="safety-types">
                                    {monthlyData.safety_reports.by_type.map((t) => (
                                        <div key={t.issue_type} className="safety-type-row">
                                            <span>{t.issue_type}</span>
                                            <span className="safety-type-count">{t.count} รายการ</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* การแจ้งเตือนความหนาแน่น */}
                            <div className="section-header" style={{ marginTop: '1.5rem' }}>
                                <h3 className="section-title">การแจ้งเตือนความหนาแน่น</h3>
                                <span className="section-badge">
                                    {monthlyData.crowd_alerts?.total || 0} ครั้ง
                                </span>
                            </div>
                        </>
                    ) : (
                        <div className="empty-state">
                            <p className="empty-text">ไม่มีข้อมูลสำหรับเดือนที่เลือก</p>
                        </div>
                    )}
                </section>
            )}

            {/* ==================== TAB: เปรียบเทียบ ==================== */}
            {activeTab === 'compare' && !loading && (
                <section className="section">
                    <div className="date-picker" style={{ flexWrap: 'wrap' }}>
                        <label>เดือนที่ 1:</label>
                        <input
                            type="month"
                            value={month1}
                            max={currentMonth}
                            onChange={(e) => setMonth1(e.target.value)}
                        />
                        <label>เดือนที่ 2:</label>
                        <input
                            type="month"
                            value={month2}
                            max={currentMonth}
                            onChange={(e) => setMonth2(e.target.value)}
                        />
                    </div>

                    {compareData ? (
                        <>
                            <div className="section-header">
                                <h3 className="section-title">เปรียบเทียบจำนวนผู้คน</h3>
                                <span className="section-badge">
                                    {formatMonthShort(month1)} เทียบ {formatMonthShort(month2)}
                                </span>
                            </div>

                            {renderCompareMetric('คนเฉลี่ย', compareData.period1?.people?.avg_people, compareData.period2?.people?.avg_people, ' คน')}
                            {renderCompareMetric('คนสูงสุด', compareData.period1?.people?.max_people, compareData.period2?.people?.max_people, ' คน')}

                            <div className="section-header" style={{ marginTop: '1.5rem' }}>
                                <h3 className="section-title">การเปลี่ยนแปลง</h3>
                                <span className="section-badge">เทียบจากเดือนที่ 1 → เดือนที่ 2</span>
                            </div>
                            <div className="delta-grid">
                                {renderDelta('คนเฉลี่ย', compareData.difference?.avg_people, ' คน')}
                                {renderDelta('คนสูงสุด', compareData.difference?.max_people, ' คน')}
                                {renderDelta('จุดเสี่ยงที่แจ้ง', compareData.difference?.safety_reports_total)}
                                {renderDelta('แจ้งเตือนหนาแน่น', compareData.difference?.crowd_alerts_total)}
                            </div>
                        </>
                    ) : (
                        <div className="empty-state">
                            <p className="empty-text">ไม่มีข้อมูลสำหรับการเปรียบเทียบ</p>
                        </div>
                    )}
                </section>
            )}

            {/* Note Box */}
            <div className="note-box">
                <p className="note-title">เกี่ยวกับข้อมูล</p>
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
