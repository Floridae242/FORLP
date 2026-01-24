// =====================================================
// กาดกองต้า - หน้ารายงาน
// แสดงสรุปข้อมูลประจำสัปดาห์และประจำเดือน
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

function formatShortDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short'
    });
}

// แปลงชื่อเดือนเป็นภาษาไทย
function getThaiMonth(month, year) {
    const months = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    return `${months[month]} ${year + 543}`;
}

// คำนวณสัปดาห์ของปี
function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

// คำนวณสรุปข้อมูลจาก history
function calculateSummary(reports) {
    if (!reports || reports.length === 0) {
        return { totalPeople: 0, avgPeople: 0, peakPeople: 0, totalDays: 0 };
    }

    const totalDays = reports.length;
    const totalPeople = reports.reduce((sum, r) => sum + (r.zone_a_peak || 0) + (r.zone_b_peak || 0) + (r.zone_c_peak || 0), 0);
    const peakPeople = Math.max(...reports.map(r => (r.zone_a_peak || 0) + (r.zone_b_peak || 0) + (r.zone_c_peak || 0)));
    const avgPeople = Math.round(totalPeople / totalDays);

    return { totalPeople, avgPeople, peakPeople, totalDays };
}

// แยกข้อมูลสัปดาห์นี้และเดือนนี้
function separateReports(reports) {
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const weekReports = [];
    const monthReports = [];

    reports.forEach(report => {
        const reportDate = new Date(report.report_date);
        const reportWeek = getWeekNumber(reportDate);
        const reportMonth = reportDate.getMonth();
        const reportYear = reportDate.getFullYear();

        // สัปดาห์นี้
        if (reportWeek === currentWeek && reportYear === currentYear) {
            weekReports.push(report);
        }

        // เดือนนี้
        if (reportMonth === currentMonth && reportYear === currentYear) {
            monthReports.push(report);
        }
    });

    return { weekReports, monthReports };
}

export default function ReportsPage() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('week'); // 'week' | 'month'

    const loadData = useCallback(async () => {
        try {
            setError(null);
            
            // โหลดรายงานย้อนหลัง 30 วัน
            const historyRes = await api.getReportHistory(30);

            if (historyRes.success) {
                setHistory(historyRes.data || []);
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

    if (loading) {
        return (
            <div className="loading-container">
                <p className="loading-text">กำลังโหลดรายงาน</p>
                <p className="loading-subtext">กรุณารอสักครู่</p>
            </div>
        );
    }

    const now = new Date();
    const { weekReports, monthReports } = separateReports(history);
    const weekSummary = calculateSummary(weekReports);
    const monthSummary = calculateSummary(monthReports);

    const currentData = activeTab === 'week' 
        ? { reports: weekReports, summary: weekSummary, label: `สัปดาห์ที่ ${getWeekNumber(now)}` }
        : { reports: monthReports, summary: monthSummary, label: getThaiMonth(now.getMonth(), now.getFullYear()) };

    return (
        <div className="page-container">
            {/* Header */}
            <header className="page-header">
                <h1 className="page-title">สรุปรายงาน</h1>
                <p className="page-subtitle">ข้อมูลสถิติถนนคนเดินกาดกองต้า</p>
            </header>

            {/* Error */}
            {error && (
                <div className="error-box">
                    <p className="error-title">ไม่สามารถโหลดข้อมูลได้</p>
                    <p className="error-message">{error}</p>
                    <button onClick={loadData} className="retry-button">ลองใหม่อีกครั้ง</button>
                </div>
            )}

            {/* Tab Selector */}
            <div className="report-tabs">
                <button 
                    className={`report-tab ${activeTab === 'week' ? 'report-tab-active' : ''}`}
                    onClick={() => setActiveTab('week')}
                >
                    ประจำสัปดาห์
                </button>
                <button 
                    className={`report-tab ${activeTab === 'month' ? 'report-tab-active' : ''}`}
                    onClick={() => setActiveTab('month')}
                >
                    ประจำเดือน
                </button>
            </div>

            {/* Summary Card */}
            <section className="section">
                <div className="section-header">
                    <h2 className="section-title">
                        {activeTab === 'week' ? 'สรุปประจำสัปดาห์' : 'สรุปประจำเดือน'}
                    </h2>
                    <span className="section-badge">{currentData.label}</span>
                </div>

                {currentData.summary.totalDays > 0 ? (
                    <div className="report-card">
                        <div className="report-stats-grid">
                            <div className="report-stat-box">
                                <div className="report-stat-content">
                                    <span className="report-stat-value">
                                        {currentData.summary.totalDays}
                                        <span className="report-stat-unit">วัน</span>
                                    </span>
                                    <span className="report-stat-label">จำนวนวันที่เปิดตลาด</span>
                                </div>
                            </div>
                            
                            <div className="report-stat-box">
                                <div className="report-stat-content">
                                    <span className="report-stat-value">
                                        {currentData.summary.totalPeople.toLocaleString()}
                                        <span className="report-stat-unit">คน</span>
                                    </span>
                                    <span className="report-stat-label">ผู้ใช้งานพื้นที่รวม</span>
                                </div>
                            </div>

                            <div className="report-stat-box">
                                <div className="report-stat-content">
                                    <span className="report-stat-value">
                                        {currentData.summary.peakPeople.toLocaleString()}
                                        <span className="report-stat-unit">คน</span>
                                    </span>
                                    <span className="report-stat-label">จำนวนสูงสุดต่อวัน</span>
                                </div>
                            </div>

                            <div className="report-stat-box">
                                <div className="report-stat-content">
                                    <span className="report-stat-value">
                                        {currentData.summary.avgPeople.toLocaleString()}
                                        <span className="report-stat-unit">คน</span>
                                    </span>
                                    <span className="report-stat-label">เฉลี่ยต่อวัน</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="report-empty">
                        <p>ยังไม่มีข้อมูล{activeTab === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้'}</p>
                        <p className="report-empty-hint">ข้อมูลจะถูกบันทึกอัตโนมัติทุกวันเสาร์-อาทิตย์</p>
                    </div>
                )}
            </section>

            {/* Report List */}
            {currentData.reports.length > 0 && (
                <section className="section" style={{ marginTop: '2rem' }}>
                    <div className="section-header">
                        <h2 className="section-title">รายละเอียดแต่ละวัน</h2>
                    </div>

                    <div className="history-list">
                        {currentData.reports.map((report, index) => {
                            const totalPeak = (report.zone_a_peak || 0) + (report.zone_b_peak || 0) + (report.zone_c_peak || 0);
                            return (
                                <div key={report.id || index} className="history-item">
                                    <div className="history-date">
                                        <span className="history-day">{formatShortDate(report.report_date)}</span>
                                    </div>
                                    <div className="history-content">
                                        <div className="history-stats">
                                            <span>รวม <strong>{totalPeak.toLocaleString()}</strong> คน</span>
                                            {report.weather_summary && (
                                                <>
                                                    <span className="history-divider">•</span>
                                                    <span>{report.weather_summary}</span>
                                                </>
                                            )}
                                        </div>
                                        <div className="history-zones">
                                            <span className="history-zone">A: {(report.zone_a_peak || 0).toLocaleString()}</span>
                                            <span className="history-zone">B: {(report.zone_b_peak || 0).toLocaleString()}</span>
                                            <span className="history-zone">C: {(report.zone_c_peak || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Comparison Note */}
            {activeTab === 'month' && monthSummary.totalDays > 0 && (
                <section className="section" style={{ marginTop: '2rem' }}>
                    <div className="report-note">
                        <p className="report-note-title">สรุปภาพรวม</p>
                        <p className="report-note-text">
                            เดือน{getThaiMonth(now.getMonth(), now.getFullYear())} มีการเปิดตลาดทั้งหมด {monthSummary.totalDays} วัน 
                            มีผู้ใช้งานพื้นที่รวมทั้งสิ้น {monthSummary.totalPeople.toLocaleString()} คน 
                            เฉลี่ยวันละ {monthSummary.avgPeople.toLocaleString()} คน
                        </p>
                    </div>
                </section>
            )}

            {/* Disclaimer */}
            <aside className="disclaimer">
                <p className="disclaimer-text">
                    ข้อมูลสถิติรวบรวมจากระบบอัตโนมัติ เพื่อประกอบการวิเคราะห์และวางแผนของเจ้าหน้าที่
                </p>
            </aside>
        </div>
    );
}
