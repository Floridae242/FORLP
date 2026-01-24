import { useState } from 'react';

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

const mockDailyData = {
    summary: {
        max_people: 524,
        min_people: 86,
        avg_people: 312,
        total_samples: 84
    },
    hourly: [
        { hour: 16, avg_people: 120 },
        { hour: 17, avg_people: 245 },
        { hour: 18, avg_people: 398 },
        { hour: 19, avg_people: 524 },
        { hour: 20, avg_people: 467 },
        { hour: 21, avg_people: 285 },
        { hour: 22, avg_people: 142 }
    ]
};

const mockWeeklyData = {
    summary: {
        total_days: 8,
        max_people: 612,
        avg_people: 345
    },
    daily: [
        { date: '2026-01-24', dayName: 'เสาร์', max_people: 524, avg_people: 312 },
        { date: '2026-01-19', dayName: 'อาทิตย์', max_people: 498, avg_people: 298 },
        { date: '2026-01-18', dayName: 'เสาร์', max_people: 567, avg_people: 356 },
        { date: '2026-01-12', dayName: 'อาทิตย์', max_people: 445, avg_people: 278 },
        { date: '2026-01-11', dayName: 'เสาร์', max_people: 612, avg_people: 389 },
        { date: '2026-01-05', dayName: 'อาทิตย์', max_people: 478, avg_people: 312 },
        { date: '2026-01-04', dayName: 'เสาร์', max_people: 534, avg_people: 345 },
        { date: '2025-12-29', dayName: 'อาทิตย์', max_people: 502, avg_people: 334 }
    ]
};

const mockHistoryData = [
    { date: '2026-01-24', dayName: 'เสาร์', max_people: 524, avg_people: 312, min_people: 86 },
    { date: '2026-01-19', dayName: 'อาทิตย์', max_people: 498, avg_people: 298, min_people: 78 },
    { date: '2026-01-18', dayName: 'เสาร์', max_people: 567, avg_people: 356, min_people: 95 },
    { date: '2026-01-12', dayName: 'อาทิตย์', max_people: 445, avg_people: 278, min_people: 67 },
    { date: '2026-01-11', dayName: 'เสาร์', max_people: 612, avg_people: 389, min_people: 112 },
    { date: '2026-01-05', dayName: 'อาทิตย์', max_people: 478, avg_people: 312, min_people: 89 },
    { date: '2026-01-04', dayName: 'เสาร์', max_people: 534, avg_people: 345, min_people: 98 },
    { date: '2025-12-29', dayName: 'อาทิตย์', max_people: 502, avg_people: 334, min_people: 92 },
    { date: '2025-12-28', dayName: 'เสาร์', max_people: 589, avg_people: 367, min_people: 105 },
    { date: '2025-12-22', dayName: 'อาทิตย์', max_people: 456, avg_people: 289, min_people: 72 },
    { date: '2025-12-21', dayName: 'เสาร์', max_people: 523, avg_people: 334, min_people: 88 },
    { date: '2025-12-15', dayName: 'อาทิตย์', max_people: 467, avg_people: 298, min_people: 76 }
];

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState('daily');
    const [selectedDate, setSelectedDate] = useState(getLastWeekendDate());

    const isClosed = !isWeekend(selectedDate);

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">รายงานข้อมูล</h1>
                <p className="page-subtitle">สรุปจำนวนผู้คนในพื้นที่ถนนคนเดินกาดกองต้า (เปิดเฉพาะวันเสาร์-อาทิตย์)</p>
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

            {activeTab === 'daily' && (
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
                            <p className="empty-text" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                                ตลาดปิดทำการในวันนี้
                            </p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                                ตลาดกาดกองต้าเปิดเฉพาะวันเสาร์และวันอาทิตย์ เวลา 16.00 - 22.00 น.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {mockDailyData.summary.max_people}
                                        <span className="stat-unit"> คน</span>
                                    </div>
                                    <div className="stat-label">จำนวนสูงสุด</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {mockDailyData.summary.avg_people}
                                        <span className="stat-unit"> คน</span>
                                    </div>
                                    <div className="stat-label">จำนวนเฉลี่ย</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {mockDailyData.summary.min_people}
                                        <span className="stat-unit"> คน</span>
                                    </div>
                                    <div className="stat-label">จำนวนต่ำสุด</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">
                                        {mockDailyData.summary.total_samples}
                                    </div>
                                    <div className="stat-label">จำนวนครั้งที่บันทึก</div>
                                </div>
                            </div>

                            <div className="hourly-section">
                                <h3 className="hourly-title">จำนวนผู้คนแยกตามช่วงเวลา (16.00 - 22.00 น.)</h3>
                                <div className="hourly-chart">
                                    {mockDailyData.hourly.map((h, i) => {
                                        const maxVal = Math.max(...mockDailyData.hourly.map(x => x.avg_people), 1);
                                        const heightPct = Math.min(100, (h.avg_people / maxVal) * 100);
                                        const isHigh = h.avg_people >= 300;
                                        return (
                                            <div key={i} className="hourly-bar-container">
                                                <div 
                                                    className={`hourly-bar ${isHigh ? 'high' : ''}`}
                                                    style={{ height: `${heightPct}%` }}
                                                ></div>
                                                <span className="hourly-value">{h.avg_people}</span>
                                                <span className="hourly-label">{h.hour}.00</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </section>
            )}

            {activeTab === 'weekly' && (
                <section className="section">
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-value">
                                {mockWeeklyData.summary.total_days}
                                <span className="stat-unit"> วัน</span>
                            </div>
                            <div className="stat-label">จำนวนวันที่เปิดตลาด</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {mockWeeklyData.summary.max_people}
                                <span className="stat-unit"> คน</span>
                            </div>
                            <div className="stat-label">สูงสุดในช่วงที่ผ่านมา</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {mockWeeklyData.summary.avg_people}
                                <span className="stat-unit"> คน</span>
                            </div>
                            <div className="stat-label">เฉลี่ยต่อวัน</div>
                        </div>
                    </div>

                    <div className="section-header" style={{ marginTop: '1.5rem' }}>
                        <h3 className="section-title">รายละเอียดแต่ละวันที่เปิดตลาด</h3>
                    </div>
                    <div className="history-list">
                        {mockWeeklyData.daily.map((day, i) => (
                            <div key={i} className="history-item">
                                <div className="history-date">
                                    {formatDateShort(day.date)}
                                    <span style={{ 
                                        fontSize: '0.75rem', 
                                        color: 'var(--text-light)',
                                        display: 'block'
                                    }}>
                                        {day.dayName}
                                    </span>
                                </div>
                                <div className="history-stats">
                                    สูงสุด <strong>{day.max_people} คน</strong> • 
                                    เฉลี่ย <strong>{day.avg_people} คน</strong>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {activeTab === 'history' && (
                <section className="section">
                    <div className="section-header">
                        <h3 className="section-title">ประวัติวันที่เปิดตลาด</h3>
                        <span className="section-badge">{mockHistoryData.length} วัน</span>
                    </div>

                    <div className="history-list">
                        {mockHistoryData.map((day, i) => (
                            <div key={i} className="history-item">
                                <div className="history-date">
                                    {formatDateShort(day.date)}
                                    <span style={{ 
                                        fontSize: '0.75rem', 
                                        color: 'var(--text-light)',
                                        display: 'block'
                                    }}>
                                        {day.dayName}
                                    </span>
                                </div>
                                <div className="history-stats">
                                    สูงสุด <strong>{day.max_people} คน</strong> • 
                                    เฉลี่ย <strong>{day.avg_people} คน</strong> • 
                                    ต่ำสุด <strong>{day.min_people} คน</strong>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <div className="note-box">
                <p className="note-title">เกี่ยวกับข้อมูล</p>
                <p className="note-text">
                    ตลาดกาดกองต้าเปิดทำการเฉพาะ <strong>วันเสาร์และวันอาทิตย์</strong> เวลา 16.00 - 22.00 น. 
                    ข้อมูลถูกบันทึกโดยระบบอัตโนมัติทุก 5 นาที
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
