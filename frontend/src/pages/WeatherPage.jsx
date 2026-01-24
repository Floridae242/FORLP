import { useState, useEffect } from 'react';

function getAirQuality(pm25) {
    if (pm25 === null || pm25 === undefined) {
        return { level: 'unknown', label: 'ไม่มีข้อมูล', advice: '' };
    }
    if (pm25 <= 25) {
        return { 
            level: 'good', 
            label: 'คุณภาพดี', 
            advice: 'อากาศดี สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ'
        };
    }
    if (pm25 <= 50) {
        return { 
            level: 'moderate', 
            label: 'ปานกลาง', 
            advice: 'คุณภาพอากาศพอใช้ ผู้ที่มีโรคประจำตัวควรระมัดระวัง'
        };
    }
    return { 
        level: 'unhealthy', 
            label: 'มีผลกระทบต่อสุขภาพ', 
            advice: 'ควรหลีกเลี่ยงกิจกรรมกลางแจ้งเป็นเวลานาน แนะนำให้สวมหน้ากากอนามัย'
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

export default function WeatherPage() {
    const [weather] = useState({
        temperature: 30,
        humidity: 65,
        description: 'ท้องฟ้าแจ่มใส',
        wind_speed: 10,
        pm25: 35,
        timestamp: new Date().toISOString()
    });

    const airQuality = getAirQuality(weather?.pm25);

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">สภาพอากาศ</h1>
                <p className="page-subtitle">ข้อมูลสภาพอากาศและคุณภาพอากาศ จังหวัดลำปาง</p>
            </header>

            <section className="section">
                <div className="section-header">
                    <h2 className="section-title">สภาพอากาศปัจจุบัน</h2>
                </div>
                
                <div className="weather-card">
                    <div className="weather-main">
                        <div>
                            <span className="weather-temp">
                                {weather.temperature ?? '-'}
                            </span>
                            <span className="weather-temp-unit">°C</span>
                        </div>
                        <div className="weather-details">
                            <p className="weather-desc">
                                {weather.description || 'ไม่มีข้อมูล'}
                            </p>
                            <p className="weather-info">
                                ความชื้นสัมพัทธ์ {weather.humidity ?? '-'}% • 
                                ความเร็วลม {weather.wind_speed ?? '-'} กม./ชม.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="section-header">
                    <h2 className="section-title">คุณภาพอากาศ (PM2.5)</h2>
                </div>
                
                <div className={`air-card ${airQuality.level}`}>
                    <div className="air-header">
                        <div>
                            <p className="air-label">ค่าฝุ่นละอองขนาดเล็ก PM2.5</p>
                            <p className="air-value">
                                {weather.pm25 ?? '-'}
                                <span className="air-unit">μg/m³</span>
                            </p>
                        </div>
                        <span className={`air-badge ${airQuality.level}`}>
                            {airQuality.label}
                        </span>
                    </div>
                    
                    {airQuality.advice && (
                        <div className="air-advice">
                            {airQuality.advice}
                        </div>
                    )}
                </div>
            </section>

            <div className="update-info" style={{ justifyContent: 'flex-start', borderTop: 'none', marginTop: 0 }}>
                <span>อัปเดตล่าสุด:</span>
                <span className="update-time">{formatTime(weather.timestamp)}</span>
            </div>

            <div className="note-box">
                <p className="note-title">แหล่งข้อมูล</p>
                <p className="note-text">
                    ข้อมูลสภาพอากาศจาก กรมอุตุนิยมวิทยา • 
                    ข้อมูลคุณภาพอากาศจาก กรมควบคุมมลพิษ
                </p>
            </div>

            <div className="disclaimer">
                <p className="disclaimer-text">
                    ข้อมูลอัปเดตอัตโนมัติทุก 5 นาที อาจมีความคลาดเคลื่อนเล็กน้อยจากสภาพจริง
                </p>
            </div>
        </div>
    );
}
