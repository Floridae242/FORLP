/* =====================================================
   หน้าสภาพอากาศ - ข้อมูลอากาศและคุณภาพอากาศ PM2.5
   อัปเดตมาตรฐาน PM2.5:
   - มาตรฐานไทย (1 มิ.ย. 2566): ≤37.5 μg/m³ (เฉลี่ย 24 ชม.)
   - มาตรฐาน WHO: ≤15 μg/m³ (เฉลี่ย 24 ชม.)
   ===================================================== */

import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://forlp-production.up.railway.app';

// มาตรฐาน PM2.5
const PM25_STANDARDS = {
    WHO: 15,
    THAI: 37.5
};

// ระดับ PM2.5
const PM25_LEVELS = [
    { range: '0-15', label: 'ดีมาก', color: '#059669' },
    { range: '16-25', label: 'ดี', color: '#10b981' },
    { range: '26-37.5', label: 'ปานกลาง', color: '#f59e0b' },
    { range: '37.6-50', label: 'เริ่มมีผลฯ', color: '#f97316' },
    { range: '51-90', label: 'มีผลต่อสุขภาพ', color: '#ef4444' },
    { range: '>90', label: 'อันตราย', color: '#991b1b' },
];

function getPM25Status(pm25) {
    if (pm25 === null || pm25 === undefined) return null;
    
    if (pm25 <= 15) return { 
        key: 'excellent', 
        label: 'ดีมาก', 
        color: '#059669',
        thaiStandard: true,
        whoStandard: true,
        advice: 'คุณภาพอากาศดีมาก เหมาะสำหรับทุกกิจกรรมกลางแจ้ง',
        healthAdvice: 'ไม่มีผลกระทบต่อสุขภาพ'
    };
    
    if (pm25 <= 25) return { 
        key: 'good', 
        label: 'ดี', 
        color: '#10b981',
        thaiStandard: true,
        whoStandard: false,
        advice: 'คุณภาพอากาศดี สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ',
        healthAdvice: 'ผู้ที่มีโรคทางเดินหายใจควรสังเกตอาการ'
    };
    
    if (pm25 <= 37.5) return { 
        key: 'moderate', 
        label: 'ปานกลาง', 
        color: '#f59e0b',
        thaiStandard: true,
        whoStandard: false,
        advice: 'คุณภาพอากาศพอใช้ ควรลดกิจกรรมกลางแจ้งหากมีอาการผิดปกติ',
        healthAdvice: 'กลุ่มเสี่ยง (เด็ก ผู้สูงอายุ ผู้ป่วยโรคหัวใจ/ปอด) ควรระวัง'
    };
    
    if (pm25 <= 50) return { 
        key: 'unhealthy_sensitive', 
        label: 'เริ่มมีผลต่อสุขภาพ', 
        color: '#f97316',
        thaiStandard: false,
        whoStandard: false,
        advice: 'ควรลดกิจกรรมกลางแจ้ง สวมหน้ากากอนามัยเมื่อออกนอกอาคาร',
        healthAdvice: 'กลุ่มเสี่ยงควรหลีกเลี่ยงกิจกรรมกลางแจ้ง'
    };
    
    if (pm25 <= 90) return { 
        key: 'unhealthy', 
        label: 'มีผลต่อสุขภาพ', 
        color: '#ef4444',
        thaiStandard: false,
        whoStandard: false,
        advice: 'หลีกเลี่ยงกิจกรรมกลางแจ้ง สวมหน้ากาก N95 เมื่อจำเป็น',
        healthAdvice: 'ทุกคนอาจได้รับผลกระทบ กลุ่มเสี่ยงควรอยู่ในอาคาร'
    };
    
    return { 
        key: 'hazardous', 
        label: 'อันตราย', 
        color: '#991b1b',
        thaiStandard: false,
        whoStandard: false,
        advice: 'งดกิจกรรมกลางแจ้งทุกชนิด สวมหน้ากาก N95 ตลอดเวลา',
        healthAdvice: 'ทุกคนควรอยู่ในอาคารที่มีเครื่องฟอกอากาศ'
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

    useEffect(() => {
        fetchWeather();
        const interval = setInterval(fetchWeather, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchWeather = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/weather`);
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
            
            const data = await response.json();
            if (data.success) {
                const weatherData = data.data.weather;
                const airQuality = data.data.air_quality;
                
                setWeather({
                    temperature: weatherData?.temperature?.current,
                    feelsLike: weatherData?.temperature?.feels_like,
                    description: weatherData?.weather?.description,
                    humidity: weatherData?.humidity,
                    windSpeed: weatherData?.wind?.speed_kmh,
                    visibility: weatherData?.visibility,
                    pm25: airQuality?.components?.pm2_5?.value,
                    timestamp: weatherData?.timestamp || new Date().toISOString()
                });
                setError(null);
            }
        } catch (err) {
            console.error('[WeatherPage] Fetch error:', err);
            setError('ไม่สามารถโหลดข้อมูลสภาพอากาศได้ กรุณาลองใหม่');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <header className="page-header">
                    <h1 className="page-title">สภาพอากาศ</h1>
                    <p className="page-subtitle">กาดกองต้า ลำปาง</p>
                </header>
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p className="loading-text">กำลังโหลดข้อมูลสภาพอากาศ...</p>
                </div>
            </div>
        );
    }

    if (error && !weather) {
        return (
            <div className="page-container">
                <header className="page-header">
                    <h1 className="page-title">สภาพอากาศ</h1>
                    <p className="page-subtitle">กาดกองต้า ลำปาง</p>
                </header>
                <div className="error-container">
                    <p className="error-text">{error}</p>
                    <button onClick={fetchWeather} className="retry-btn">ลองใหม่</button>
                </div>
            </div>
        );
    }

    const pm25Value = weather?.pm25;
    const pm25Status = getPM25Status(pm25Value);
    const pm25Display = pm25Value !== null && pm25Value !== undefined 
        ? Math.round(pm25Value * 10) / 10 
        : '-';

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
                        <span className="temp-value">{weather?.temperature ?? '-'}</span>
                        <span className="temp-unit">°C</span>
                    </div>
                    <div className="weather-desc">
                        <p className="weather-condition">{weather?.description || 'ไม่มีข้อมูล'}</p>
                        {weather?.feelsLike && (
                            <p className="weather-feels">รู้สึกเหมือน {weather.feelsLike}°C</p>
                        )}
                    </div>
                </div>

                <div className="weather-details">
                    <div className="weather-detail-item">
                        <span className="detail-label">ความชื้น</span>
                        <span className="detail-value">{weather?.humidity ?? '-'}%</span>
                    </div>
                    <div className="weather-detail-item">
                        <span className="detail-label">ลม</span>
                        <span className="detail-value">{weather?.windSpeed ?? '-'} km/h</span>
                    </div>
                    <div className="weather-detail-item">
                        <span className="detail-label">ทัศนวิสัย</span>
                        <span className="detail-value">{weather?.visibility ?? '-'} km</span>
                    </div>
                </div>
            </div>

            {/* PM2.5 Card */}
            <div className="pm25-card">
                <h2 className="section-title">คุณภาพอากาศ PM2.5</h2>
                
                <div className="pm25-main">
                    <span 
                        className="pm25-value" 
                        style={{ color: pm25Status?.color || 'var(--text-heading)' }}
                    >
                        {pm25Display}
                    </span>
                    <span className="pm25-unit">μg/m³</span>
                </div>
                
                {pm25Status && (
                    <div 
                        className="pm25-status" 
                        style={{ 
                            background: pm25Status.color + '15', 
                            color: pm25Status.color,
                            border: `1px solid ${pm25Status.color}30`
                        }}
                    >
                        {pm25Status.label}
                    </div>
                )}
                
                {/* เปรียบเทียบมาตรฐาน */}
                {pm25Status && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '0.75rem',
                        marginTop: '1rem',
                        marginBottom: '1rem',
                        flexWrap: 'wrap'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: 'var(--border-radius)',
                            background: pm25Status.thaiStandard ? 'var(--status-safe-bg)' : 'var(--status-danger-bg)',
                            border: pm25Status.thaiStandard ? '1px solid var(--status-safe-border)' : '1px solid var(--status-danger-border)',
                            fontSize: '0.8125rem'
                        }}>
                            <span style={{ 
                                color: pm25Status.thaiStandard ? 'var(--status-safe)' : 'var(--status-danger)',
                                fontWeight: '600'
                            }}>
                                {pm25Status.thaiStandard ? '✓' : '✗'}
                            </span>
                            <span style={{ color: 'var(--text-body)' }}>
                                มาตรฐานไทย (≤{PM25_STANDARDS.THAI})
                            </span>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: 'var(--border-radius)',
                            background: pm25Status.whoStandard ? 'var(--status-safe-bg)' : 'var(--status-caution-bg)',
                            border: pm25Status.whoStandard ? '1px solid var(--status-safe-border)' : '1px solid var(--status-caution-border)',
                            fontSize: '0.8125rem'
                        }}>
                            <span style={{ 
                                color: pm25Status.whoStandard ? 'var(--status-safe)' : 'var(--status-caution)',
                                fontWeight: '600'
                            }}>
                                {pm25Status.whoStandard ? '✓' : '✗'}
                            </span>
                            <span style={{ color: 'var(--text-body)' }}>
                                มาตรฐาน WHO (≤{PM25_STANDARDS.WHO})
                            </span>
                        </div>
                    </div>
                )}
                
                {/* คำแนะนำ */}
                {pm25Status && (
                    <div style={{
                        background: 'var(--bg-muted)',
                        borderRadius: 'var(--border-radius)',
                        padding: '1rem',
                        marginTop: '0.5rem',
                        textAlign: 'left'
                    }}>
                        <p style={{
                            fontSize: '0.9375rem',
                            color: 'var(--text-body)',
                            marginBottom: '0.5rem',
                            lineHeight: 1.6
                        }}>
                            <strong>คำแนะนำ:</strong> {pm25Status.advice}
                        </p>
                        <p style={{
                            fontSize: '0.875rem',
                            color: 'var(--text-muted)',
                            margin: 0,
                            lineHeight: 1.6
                        }}>
                            <strong>ผลต่อสุขภาพ:</strong> {pm25Status.healthAdvice}
                        </p>
                    </div>
                )}

                {!pm25Status && (
                    <p className="pm25-advice">ไม่มีข้อมูลคุณภาพอากาศ</p>
                )}
            </div>

            {/* PM2.5 Level Guide */}
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-lg)',
                padding: '1.25rem',
                marginTop: '1rem'
            }}>
                <h3 style={{
                    fontSize: '0.9375rem',
                    fontWeight: '600',
                    color: 'var(--text-heading)',
                    marginBottom: '1rem'
                }}>
                    ระดับคุณภาพอากาศ PM2.5
                </h3>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '0.5rem'
                }}>
                    {PM25_LEVELS.map((level) => (
                        <div key={level.range} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem',
                            background: level.color + '10',
                            borderRadius: 'var(--border-radius)',
                            border: `1px solid ${level.color}20`
                        }}>
                            <span style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '2px',
                                background: level.color,
                                flexShrink: 0
                            }}></span>
                            <span style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-body)'
                            }}>
                                {level.range} = {level.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Update Info */}
            <div className="update-info">
                <span>อัปเดตล่าสุด:</span>
                <span className="update-time">{formatTime(weather?.timestamp)}</span>
                <span className="update-auto">• อัปเดตอัตโนมัติทุก 5 นาที</span>
            </div>

            {/* Note about standards */}
            <div className="note-box">
                <p className="note-title">เกี่ยวกับมาตรฐาน PM2.5</p>
                <p className="note-text">
                    <strong>มาตรฐานไทย:</strong> ค่าเฉลี่ย 24 ชม. ไม่เกิน 37.5 μg/m³ (เริ่มใช้ 1 มิ.ย. 2566)<br/>
                    <strong>มาตรฐาน WHO:</strong> ค่าเฉลี่ย 24 ชม. ไม่เกิน 15 μg/m³<br/>
                    กลุ่มเสี่ยง: เด็ก, ผู้สูงอายุ, สตรีมีครรภ์, ผู้ป่วยโรคหัวใจ/ปอด/ภูมิแพ้
                </p>
            </div>

            {/* Disclaimer */}
            <div className="disclaimer">
                <p className="disclaimer-text">
                    ข้อมูลจาก OpenWeatherMap API<br />
                    ควรตรวจสอบค่าฝุ่นก่อนออกจากบ้านและสวมหน้ากากอนามัยเมื่อจำเป็น
                </p>
            </div>
        </div>
    );
}
