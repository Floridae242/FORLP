// =====================================================
// กาดกองต้า - หน้ารายงาน
// แสดงรายงานประจำวันและรายงานย้อนหลัง
// =====================================================

import { useState, useEffect, useCallback } from 'react';
import { api, showError } from '../services/api.jsx';

// แปลงวันที่เป็นภาษาไทย
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatShortDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short'
    });
}

export default function ReportsPage() {
    const [latestReport, setLatestReport] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [generating, setGenerating] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setError(null);
            
            // โหลดรายงานล่าสุดและประวัติพร้อมกัน
            const [dailyRes, historyRes] = await Promise.allSettled([
                api.getDailyReport(),
                api.getReportHistory(7)
            ]);

            if (dailyRes.status === 'fulfilled' && dailyRes.value.success) {
                setLatestReport(dailyRes.value.data);
            } else {
                setLatestReport(null);
            }

            if (historyRes.status === 'fulfilled' && historyRes.value.success) {
                setHistory(historyRes.value.data || []);
            }
        } catch (err) {
            setError(showError(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // สร้างรายงานใหม่
    const handleGenerate = async (sendLine = false) => {
        if (generating) return;
        
        const confirmMsg = sendLine 
            ? 'ต้องการสร้างรายงานและส่งไปยัง LINE OA หรือไม่?' 
            : 'ต้องการสร้างรายงานใหม่หรือไม่?';
        
        if (!window.confirm(confirmMsg)) return;

        setGenerating(true);
        try {
            await api.generateReport(null, sendLine);
            await loadData(); // โหลดข้อมูลใหม่
            alert(sendLine ? 'สร้างรายงานและส่ง LINE เรียบร้อยแล้ว' : 'สร้างรายงานเรียบร้อยแล้ว');
        } catch (err) {
            alert('ไม่สามารถสร้างรายงานได้: ' + showError(err));
        } finally {
            setGenerating(false);
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <p className="loading-text">กำลังโหลดรายงาน</p>
                <p className="loading-subtext">กรุณารอสักครู่</p>
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Header */}
            <header className="page-header">
                <h1 className="page-title">รายงานประจำวัน</h1>
                <p className="page-subtitle">สรุปข้อมูลถนนคนเดินกาดกองต้า</p>
            </header>

            {/* Error */}
            {error && (
                <div className="error-box">
                    <p className="error-title">ไม่สามารถโหลดข้อมูลได้</p>
                    <p className="error-message">{error}</p>
                    <button onClick={loadData} className="retry-button">ลองใหม่อีกครั้ง</button>
                </div>
            )}

            {/* Latest Report */}
            <section className="section">
                <div className="section-header">
                    <h2 className="section-title">รายงานล่าสุด</h2>
                </div>

                {latestReport ? (
                    <div className="report-card">
                        <div className="report-header">
                            <div>
                                <p className="report-date">{formatDate(latestReport.report_date)}</p>
                                <p className="report-meta">สร้างเมื่อ {formatDateTime(latestReport.created_at)}</p>
                            </div>
                            {latestReport.sent_to_line && (
                                <span className="report-badge report-badge-sent">ส่ง LINE แล้ว</span>
                            )}
                        </div>

                        <div className="report-stats">
                            <div className="report-stat">
                                <span className="report-stat-label">จำนวนผู้ใช้งานสูงสุด</span>
                                <span className="report-stat-value">
                                    {latestReport.peak_people?.toLocaleString() || '-'}
                                    <span className="report-stat-unit">คน</span>
                                </span>
                            </div>
                            <div className="report-stat">
                                <span className="report-stat-label">จำนวนผู้ใช้งานเฉลี่ย</span>
                                <span className="report-stat-value">
                                    {latestReport.avg_people?.toLocaleString() || '-'}
                                    <span className="report-stat-unit">คน</span>
                                </span>
                            </div>
                        </div>

                        {latestReport.weather_summary && (
                            <div className="report-weather">
                                <span className="report-weather-label">สภาพอากาศ:</span>
                                <span className="report-weather-text">{latestReport.weather_summary}</span>
                            </div>
                        )}

                        {latestReport.summary && (
                            <p className="report-summary">{latestReport.summary}</p>
                        )}
                    </div>
                ) : (
                    <div className="report-empty">
                        <p>ยังไม่มีรายงาน</p>
                        <p className="report-empty-hint">รายงานจะถูกสร้างอัตโนมัติทุกวันเสาร์-อาทิตย์ เวลา 23.00 น.</p>
                    </div>
                )}
            </section>

            {/* Actions */}
            <section className="section" style={{ marginTop: '2rem' }}>
                <div className="report-actions">
                    <button 
                        onClick={() => handleGenerate(false)} 
                        disabled={generating}
                        className="action-button action-button-secondary"
                    >
                        {generating ? 'กำลังสร้าง...' : 'สร้างรายงานใหม่'}
                    </button>
                    <button 
                        onClick={() => handleGenerate(true)} 
                        disabled={generating}
                        className="action-button action-button-primary"
                    >
                        {generating ? 'กำลังส่ง...' : 'สร้างและส่ง LINE'}
                    </button>
                </div>
            </section>

            {/* History */}
            {history.length > 0 && (
                <section className="section" style={{ marginTop: '3rem' }}>
                    <div className="section-header">
                        <h2 className="section-title">รายงานย้อนหลัง</h2>
                    </div>

                    <div className="history-list">
                        {history.map((report, index) => (
                            <div key={report.id || index} className="history-item">
                                <div className="history-date">
                                    <span className="history-day">{formatShortDate(report.report_date)}</span>
                                </div>
                                <div className="history-content">
                                    <div className="history-stats">
                                        <span>สูงสุด <strong>{report.peak_people?.toLocaleString() || '-'}</strong> คน</span>
                                        <span className="history-divider">•</span>
                                        <span>เฉลี่ย <strong>{report.avg_people?.toLocaleString() || '-'}</strong> คน</span>
                                    </div>
                                    {report.sent_to_line && (
                                        <span className="history-sent">✓ ส่ง LINE</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Disclaimer */}
            <aside className="disclaimer">
                <p className="disclaimer-text">
                    รายงานถูกสร้างอัตโนมัติจากข้อมูลระบบ เพื่อประกอบการวิเคราะห์และวางแผนของเจ้าหน้าที่
                </p>
            </aside>
        </div>
    );
}
