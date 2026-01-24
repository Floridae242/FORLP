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
                        <div className="empty-state">
                            <p className="empty-text">ยังไม่มีข้อมูลสำหรับวันที่เลือก</p>
                        </div>
                    )}
                </section>
            )}

            {activeTab === 'weekly' && (
                <section className="section">
                    <div className="empty-state">
                        <p className="empty-text">ยังไม่มีข้อมูลรายสัปดาห์</p>
                    </div>
                </section>
            )}

            {activeTab === 'history' && (
                <section className="section">
                    <div className="section-header">
                        <h3 className="section-title">ประวัติวันที่เปิดตลาด</h3>
                        <span className="section-badge">0 วัน</span>
                    </div>

                    <div className="empty-state">
                        <p className="empty-text">ยังไม่มีข้อมูลประวัติ</p>
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
