import { useState, useEffect } from 'react';

function getStatus(count) {
    if (count >= 600) return { 
        key: 'crowded', 
        label: 'หนาแน่นมาก', 
        desc: 'พื้นที่มีผู้คนหนาแน่น เจ้าหน้าที่ควรเฝ้าระวังเป็นพิเศษ'
    };
    if (count >= 300) return { 
        key: 'busy', 
        label: 'ค่อนข้างหนาแน่น', 
        desc: 'มีผู้คนจำนวนมากในพื้นที่ สามารถเดินชมได้ตามปกติ'
    };
    if (count >= 100) return { 
        key: 'moderate', 
        label: 'ปานกลาง', 
        desc: 'มีผู้คนพอสมควร การสัญจรสะดวก'
    };
    return { 
        key: 'normal', 
        label: 'ปกติ', 
        desc: 'พื้นที่โล่ง การสัญจรสะดวกมาก'
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

export default function PeoplePage() {
    const [count, setCount] = useState(0);
    const [timestamp, setTimestamp] = useState(new Date().toISOString());

    useEffect(() => {
        const interval = setInterval(() => {
            setTimestamp(new Date().toISOString());
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const status = getStatus(count);

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">ภาพรวมพื้นที่</h1>
                <p className="page-subtitle">ถนนคนเดินกาดกองต้า เทศบาลนครลำปาง</p>
            </header>

            <div className="counter-card">
                <p className="counter-label">จำนวนผู้คนในพื้นที่ขณะนี้</p>
                
                <div className="counter-value-wrap">
                    <span className="counter-value">{count.toLocaleString()}</span>
                    <span className="counter-unit">คน</span>
                </div>
                
                <div className={`counter-status ${status.key}`}>
                    {status.label}
                </div>
                
                <p className="counter-desc">{status.desc}</p>
                
                <div className="update-info">
                    <span>อัปเดตล่าสุด:</span>
                    <span className="update-time">{formatTime(timestamp)}</span>
                    <span className="update-auto">• ระบบอัปเดตอัตโนมัติทุก 5 วินาที</span>
                </div>
            </div>

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

            <div className="disclaimer">
                <p className="disclaimer-text">
                    ข้อมูลนี้ประมวลผลโดยระบบอัตโนมัติ ใช้เพื่อประกอบการตัดสินใจของเจ้าหน้าที่เท่านั้น
                </p>
            </div>
        </div>
    );
}
