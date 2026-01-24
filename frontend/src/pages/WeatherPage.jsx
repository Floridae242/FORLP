// =====================================================
// กาดกองต้า - หน้าสภาพอากาศ
// ออกแบบให้เป็นมิตร อ่านง่าย เหมาะกับหน่วยงานรัฐ
// =====================================================

import { useState, useEffect, useCallback } from 'react';
import { api, showError } from '../services/api.jsx';

// แปลง PM2.5 เป็นสถานะ
function getAirStatus(pm25) {
    if (pm25 === null || pm25 === undefined) return {
        key: 'unknown',
        label: 'ไม่มีข้อมูล',
        advice: 'ไม่สามารถดึงข้อมูลคุณภาพอากาศได้ในขณะนี้'
    };
    if (pm25 <= 25) return {
        key: 'good',
        label: 'ดี',
        advice: 'อากาศดี เหมาะสำหรับกิจกรรมกลางแจ้งทุกประเภท'
    };
    if (pm25 <= 37) return {
        key: 'good',
        label: 'ดีพอใช้',
        advice: 'คุณภาพอากาศอยู่ในเกณฑ์ปกติ สามารถทำกิจกรรมได้ตามปกติ'
    };
    if (pm25 <= 50) return {
        key: 'moderate',
        label: 'ปานกลาง',
        advice: 'ผู้ที่มีโรคทางเดินหายใจอาจต้องระมัดระวังบ้าง'
    };
    if (pm25 <= 90) return {
        key: 'unhealthy',
        label: 'เริ่มมีผลกระทบ',
        advice: 'ควรลดกิจกรรมกลางแจ้งที่ใช้แรงมาก โดยเฉพาะผู้สูงอายุและเด็กเล็ก'
    };
    return {
        key: 'hazardous',
        label: 'มีผลต่อสุขภาพ',
        advice: 'ควรหลีกเลี่ยงกิจกรรมกลางแจ้ง และสวมหน้ากากอนามัยเมื่อต้องออกนอกอาคาร'
    };
}

// สรุปสภาพอากาศ
function getWeatherSummary(temp) {
    if (!temp) return '';
    if (temp >= 35) return 'อากาศร้อนจัด ควรดื่มน้ำบ่อยๆ และพักในที่ร่มเป็นระยะ';
    if (temp >= 30) return 'อากาศค่อนข้างร้อน ควรเตรียมน้ำดื่มและหมวกกันแดด';
    if (temp >= 25) return 'อากาศอบอุ่นสบาย เหมาะสำหรับการเดินเที่ยวชม';
    return 'อากาศเย็นสบาย อาจพกเสื้อกันหนาวบางๆ ติดตัว';
}

// แปลงเวลา
function formatTime(date) {
    return new Date(date).toLocaleTimeString('th-TH', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

export default function WeatherPage() {
    const [weather, setWeather] = useState(null);
    const [airQuality, setAirQuality] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isMock, setIsMock] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setError(null);
            const response = await api.getDashboard();
            
            if (response.success) {
                setWeather(response.data.weather || null);
                setAirQuality(response.data.air_quality || null);
                setLastUpdate(new Date());
                setIsMock(response.data.system?.mode === 'mock');
            }
        } catch (err) {
            setError(showError(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 60000);
        return () => clearInterval(interval);
    }, [loadData]);

    if (loading) {
        return (
            <div className="loading-container">
                <p className="loading-text">กำลังโหลดข้อมูล</p>
                <p className="loading-subtext">กรุณารอสักครู่</p>
            </div>
        );
    }

    const pm25 = airQuality?.pm25;
    const airStatus = getAirStatus(pm25);
    const weatherSummary = getWeatherSummary(weather?.temperature);

    return (
        <div className="page-container">
            {/* Header */}
            <header className="page-header">
                <h1 className="page-title">สภาพอากาศ</h1>
                <p className="page-subtitle">ถนนคนเดินกาดกองต้า จ.ลำปาง</p>
            </header>

            {/* Meta Info */}
            <div className="meta-info">
                <span>ข้อมูล ณ เวลา {lastUpdate ? formatTime(lastUpdate) : '-'} น.</span>
                {isMock && (
                    <>
                        <span className="meta-divider"></span>
                        <span className="mock-indicator">ตัวอย่าง</span>
                    </>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="error-box">
                    <p className="error-title">ไม่สามารถโหลดข้อมูลได้</p>
                    <p className="error-message">{error}</p>
                    <button onClick={loadData} className="retry-button">ลองใหม่อีกครั้ง</button>
                </div>
            )}

            {/* Weather Section */}
            <section className="section">
                <div className="section-header">
                    <h2 className="section-title">อุณหภูมิขณะนี้</h2>
                </div>
                
                <div className="weather-card">
                    {weather?.temperature ? (
                        <>
                            <div className="weather-main">
                                <div>
                                    <span className="weather-temp">{weather.temperature}</span>
                                    <span className="weather-temp-unit">°C</span>
                                </div>
                                <div className="weather-condition">
                                    <p className="weather-desc">{weather.description || 'ไม่มีข้อมูล'}</p>
                                    {weather.humidity && (
                                        <p className="weather-detail">ความชื้นในอากาศ {weather.humidity}%</p>
                                    )}
                                </div>
                            </div>
                            {weatherSummary && (
                                <p className="weather-summary">{weatherSummary}</p>
                            )}
                        </>
                    ) : (
                        <p className="no-data">ไม่สามารถดึงข้อมูลสภาพอากาศได้ในขณะนี้</p>
                    )}
                </div>
            </section>

            {/* Air Quality Section - เพิ่ม spacing ให้ต่างจาก section ข้างบน */}
            <section className="section" style={{ marginTop: '3rem' }}>
                <div className="section-header">
                    <h2 className="section-title">คุณภาพอากาศ</h2>
                </div>
                
                <div className="air-card" data-status={airStatus.key}>
                    {pm25 !== null && pm25 !== undefined ? (
                        <>
                            <div className="air-header">
                                <div>
                                    <p className="air-label">ค่าฝุ่นละออง PM2.5</p>
                                    <p className="air-value">
                                        {Math.round(pm25)}
                                        <span className="air-unit">µg/m³</span>
                                    </p>
                                </div>
                                <span className="air-badge" data-status={airStatus.key}>
                                    {airStatus.label}
                                </span>
                            </div>
                            <p className="air-advice">{airStatus.advice}</p>
                        </>
                    ) : (
                        <p className="no-data">ไม่สามารถดึงข้อมูลคุณภาพอากาศได้ในขณะนี้</p>
                    )}
                </div>
            </section>

            {/* Disclaimer */}
            <aside className="disclaimer">
                <center><p className="disclaimer-text">
                    ข้อมูลนี้เป็นการประเมินจากระบบอัตโนมัติ อาจมีความคลาดเคลื่อนจากสถานการณ์จริง
                </p></center>
            </aside>
        </div>
    );
}
