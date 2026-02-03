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

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState('daily');
    const [selectedDate, setSelectedDate] = useState(getLastWeekendDate());
    
    const [dailyData, setDailyData] = useState(null);
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

    const fetchHistoryData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/people/history?days=30`);
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
            
            const data = await response.json();
            if (data.success) {
                setHistoryData(data.data || []);
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
        } else if (activeTab === 'weekly' || activeTab === 'history') {
            fetchHistoryData();
        }
    }, [activeTab, selectedDate, fetchDailyData, fetchHistoryData]);

    const weeklyData = historyData.slice(0, 8);
    const weeklySummary = {
        total_days: weeklyData.length,
        max_people: weeklyData.length > 0 ? Math.max(...weeklyData.map(d => d.max_people || 0)) : 0,
        avg_people: weeklyData.length > 0 ? Math.round(weeklyData.reduce((sum, d) => sum + (d.avg_people || 0), 0) / weeklyData.length) : 0
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

            {activeTab === 'weekly' && !loading && (
                <section className="section">
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-value">
                                {weeklySummary.total_days}
                                <span className="stat-unit"> วัน</span>
                            </div>
                            <div className="stat-label">วันที่เปิดตลาด</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {weeklySummary.max_people}
                                <span className="stat-unit"> คน</span>
                            </div>
                            <div className="stat-label">สูงสุดในช่วงนี้</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {weeklySummary.avg_people}
                                <span className="stat-unit"> คน</span>
                            </div>
                            <div className="stat-label">เฉลี่ยต่อวัน</div>
                        </div>
                    </div>

                    <div className="section-header" style={{ marginTop: '1.5rem' }}>
                        <h3 className="section-title">รายละเอียดแต่ละวัน</h3>
                    </div>
                    
                    {weeklyData.length > 0 ? (
                        <div className="history-list">
                            {weeklyData.map((day, i) => (
                                <div key={i} className="history-item">
                                    <div className="history-date">
                                        {formatDateShort(day.date)}
                                        <span style={{ 
                                            fontSize: '0.75rem', 
                                            color: 'var(--text-light)',
                                            display: 'block'
                                        }}>
                                            {getDayName(day.date)}
                                        </span>
                                    </div>
                                    <div className="history-stats">
                                        สูงสุด <strong>{day.max_people || 0} คน</strong> • 
                                        เฉลี่ย <strong>{Math.round(day.avg_people || 0)} คน</strong>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p className="empty-text">ยังไม่มีข้อมูล</p>
                        </div>
                    )}
                </section>
            )}

            {activeTab === 'history' && !loading && (
                <section className="section">
                    <div className="section-header">
                        <h3 className="section-title">ประวัติวันที่เปิดตลาด</h3>
                        <span className="section-badge">{historyData.length} วัน</span>
                    </div>

                    {historyData.length > 0 ? (
                        <div className="history-list">
                            {historyData.map((day, i) => (
                                <div key={i} className="history-item">
                                    <div className="history-date">
                                        {formatDateShort(day.date)}
                                        <span style={{ 
                                            fontSize: '0.75rem', 
                                            color: 'var(--text-light)',
                                            display: 'block'
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

            <div className="note-box">
                <p className="note-title">เกี่ยวกับข้อมูล</p>
                <p className="note-text">
                    ตลาดกาดกองต้าเปิดทำการเฉพาะ <strong>วันเสาร์และวันอาทิตย์</strong> เวลา 16.00 - 22.00 น. 
                    ข้อมูลถูกบันทึกโดยระบบอัตโนมัติ
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
