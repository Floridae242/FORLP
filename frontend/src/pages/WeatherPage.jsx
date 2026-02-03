import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getPM25Status(pm25) {
    if (pm25 <= 25) return { key: 'good', label: 'ดีมาก', color: '#10b981' };
    if (pm25 <= 50) return { key: 'moderate', label: 'ปานกลาง', color: '#f59e0b' };
    if (pm25 <= 100) return { key: 'unhealthy', label: 'มีผลต่อสุขภาพ', color: '#f97316' };
    return { key: 'hazardous', label: 'อันตราย', color: '#ef4444' };
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

    useEffect(() => {
        fetchWeather();
        const interval = setInterval(fetchWeather, 5 * 60 * 1000); // อัปเดตทุก 5 นาที
        return () => clearInterval(interval);
    }, []);

    const fetchWeather = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/weather`);
            if (!response.ok) throw new Error('Failed to fetch weather');
            const data = await response.json();
            if (data.success) {
                setWeather(data.data);
                setError(null);
            }
        } catch (err) {
            console.error('Weather fetch error:', err);
            setError('ไม่สามารถโหลดข้อมูลสภาพอากาศได้');
        } finally {
            setLoading(false);
        }
    };

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

    if (error) {
        return (
            <div className="page-container">
                <div className="error-container">
                    <p className="error-text">{error}</p>
                    <button onClick={fetchWeather} className="retry-btn">ลองใหม่</button>
                </div>
            </div>
        );
    }

    const pm25Status = weather?.pm25 ? getPM25Status(weather.pm25) : null;

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">สภาพอากาศ</h1>
                <p className="page-subtitle">กาดกองต้า ลำปาง</p>
            </header>

            {/* Weather Card */}
            <div className="weather-card">
                <div className="weather-main">
                    <div className="weather-temp">
                        <span className="temp-value">{weather?.temperature || '-'}</span>
                        <span className="temp-unit">°C</span>
                    </div>
                    <div className="weather-desc">
                        <p className="weather-condition">{weather?.description || 'ไม่มีข้อมูล'}</p>
                        <p className="weather-feels">รู้สึกเหมือน {weather?.feelsLike || '-'}°C</p>
                    </div>
                </div>

                <div className="weather-details">
                    <div className="weather-detail-item">
                        <span className="detail-label">ความชื้น</span>
                        <span className="detail-value">{weather?.humidity || '-'}%</span>
                    </div>
                    <div className="weather-detail-item">
                        <span className="detail-label">ลม</span>
                        <span className="detail-value">{weather?.windSpeed || '-'} km/h</span>
                    </div>
                    <div className="weather-detail-item">
                        <span className="detail-label">ทัศนวิสัย</span>
                        <span className="detail-value">{weather?.visibility || '-'} km</span>
                    </div>
                </div>
            </div>

            {/* PM2.5 Card */}
            <div className="pm25-card">
                <h2 className="section-title">คุณภาพอากาศ PM2.5</h2>
                <div className="pm25-main">
                    <div className="pm25-value" style={{ color: pm25Status?.color }}>
                        {weather?.pm25 || '-'}
                    </div>
                    <div className="pm25-unit">μg/m³</div>
                </div>
                {pm25Status && (
                    <div className="pm25-status" style={{ background: pm25Status.color + '20', color: pm25Status.color }}>
                        {pm25Status.label}
                    </div>
                )}
                <p className="pm25-advice">
                    {weather?.pm25 <= 25 && 'คุณภาพอากาศดี เหมาะสำหรับกิจกรรมกลางแจ้ง'}
                    {weather?.pm25 > 25 && weather?.pm25 <= 50 && 'คุณภาพอากาศปานกลาง ผู้ที่แพ้ง่ายควรระวัง'}
                    {weather?.pm25 > 50 && weather?.pm25 <= 100 && 'ควรลดกิจกรรมกลางแจ้ง สวมหน้ากากอนามัย'}
                    {weather?.pm25 > 100 && 'หลีกเลี่ยงกิจกรรมกลางแจ้ง สวมหน้ากาก N95'}
                </p>
            </div>

            {/* Update Info */}
            <div className="update-info">
                <span>อัปเดตล่าสุด:</span>
                <span className="update-time">{formatTime(weather?.timestamp)}</span>
            </div>

            {/* Disclaimer */}
            <div className="disclaimer">
                <p className="disclaimer-text">
                    ข้อมูลจาก OpenWeatherMap<br />
                    ใช้เพื่อประกอบการตัดสินใจเท่านั้น
                </p>
            </div>
        </div>
    );
}
