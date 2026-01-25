import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchWeather = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/weather/current`);
            const result = await response.json();
            
            if (result.success) {
                setWeather(result.data);
                setError(null);
            } else {
                setError('ไม่สามารถโหลดข้อมูลได้');
            }
        } catch (err) {
            console.error('Weather fetch error:', err);
            setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWeather();
        
        // อัปเดตทุก 5 นาที
        const interval = setInterval(fetchWeather, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const airQuality = getAirQuality(weather?.pm25);

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p className="loading-text">กำลังโหลดข้อมูลสภาพอากาศ...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">สภาพอากาศ</h1>
                <p className="page-subtitle">ข้อมูลสภาพอากาศและคุณภาพอากาศ จังหวัดลำปาง</p>
            </header>

            {error && (
                <div className="error-box">
                    <p className="error-text">{error}</p>
                    <button className="retry-button" onClick={fetchWeather}>
                        ลองใหม่
                    </button>
                </div>
            )}

            <section className="section">
                <div className="section-header">
                    <h2 className="section-title">สภาพอากาศปัจจุบัน</h2>
                </div>
                
                <div className="weather-card">
                    <div className="weather-main">
                        <div>
                            <span className="weather-temp">
                                {weather?.temperature ?? '-'}
                            </span>
                            <span className="weather-temp-unit">°C</span>
                        </div>
                        <div className="weather-details">
                            <p className="weather-desc">
                                {weather?.description || 'ไม่มีข้อมูล'}
                            </p>
                            <p className="weather-info">
                                ความชื้นสัมพัทธ์ {weather?.humidity ?? '-'}% • 
                                ความเร็วลม {weather?.wind_speed ?? '-'} กม./ชม.
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
                                {weather?.pm25 ?? '-'}
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
                <span className="update-time">{formatTime(weather?.timestamp)}</span>
            </div>

            <div className="note-box">
                <p className="note-title">แหล่งข้อมูล</p>
                <p className="note-text">
                    ข้อมูลสภาพอากาศจาก OpenWeatherMap • 
                    ข้อมูลคุณภาพอากาศจาก OpenWeatherMap Air Pollution API
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
