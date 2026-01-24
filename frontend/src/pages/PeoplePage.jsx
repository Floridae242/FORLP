// =====================================================
// กาดกองต้า - หน้าผู้ใช้งานพื้นที่
// ออกแบบให้เป็นมิตร อ่านง่าย เหมาะกับหน่วยงานรัฐ
// =====================================================

import { useState, useEffect, useCallback } from 'react';
import { api, showError } from '../services/api.jsx';

// ข้อมูลโซน - เพิ่มรายละเอียดให้เป็นมนุษย์มากขึ้น
const ZONES = {
    'A': { name: 'โซนหน้าตลาด', area: 'ทางเข้าหลักฝั่งถนนตลาดเก่า' },
    'B': { name: 'โซนกลางตลาด', area: 'ลานกิจกรรมและร้านค้าหลัก' },
    'C': { name: 'โซนท้ายตลาด', area: 'โซนอาหาร ใกล้ทางออกริมน้ำ' }
};

// แปลงสถานะความหนาแน่น
function getStatus(percent) {
    if (percent >= 80) return { 
        key: 'crowded',
        label: 'หนาแน่นมาก',
        text: 'มีผู้คนค่อนข้างแออัด'
    };
    if (percent >= 60) return { 
        key: 'busy',
        label: 'ค่อนข้างหนาแน่น',
        text: 'มีผู้คนพอสมควร'
    };
    if (percent >= 40) return { 
        key: 'moderate',
        label: 'ปานกลาง',
        text: 'เดินชมได้สะดวก'
    };
    return { 
        key: 'normal',
        label: 'ปกติ',
        text: 'พื้นที่โล่ง สบาย'
    };
}

// สรุปสถานการณ์รวม
function getSummaryText(total) {
    if (total >= 800) return 'พื้นที่มีความหนาแน่นสูง เจ้าหน้าที่ควรเฝ้าระวัง';
    if (total >= 500) return 'มีผู้ใช้งานค่อนข้างมาก สถานการณ์ปกติ';
    if (total >= 300) return 'สถานการณ์โดยรวมอยู่ในระดับปานกลาง';
    return 'สถานการณ์โดยรวมปกติ พื้นที่ยังรองรับได้อีก';
}

// แปลงเวลา
function formatTime(date) {
    return new Date(date).toLocaleTimeString('th-TH', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

export default function PeoplePage() {
    const [zones, setZones] = useState([]);
    const [totalPeople, setTotalPeople] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isMock, setIsMock] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setError(null);
            const response = await api.getDashboard();
            
            if (response.success) {
                setZones(response.data.zones || []);
                setTotalPeople(response.data.total_people || 0);
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
        const interval = setInterval(loadData, 30000);
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

    return (
        <div className="page-container">
            {/* Header */}
            <header className="page-header">
                <h1 className="page-title">ผู้ใช้งานพื้นที่</h1>
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

            {/* Summary - ลดความโชว์เทคโนโลยี */}
            <div className="summary-section">
                <p className="summary-eyebrow">ขณะนี้มีผู้ใช้งานพื้นที่โดยประมาณ</p>
                <p className="summary-value">
                    {totalPeople.toLocaleString()}
                    <span className="summary-unit">คน</span>
                </p>
                <p className="summary-context">{getSummaryText(totalPeople)}</p>
            </div>

            {/* Zone List */}
            <section className="section">
                <div className="section-header">
                    <h2 className="section-title">รายละเอียดแยกตามโซน</h2>
                </div>
                
                <div className="zone-list">
                    {zones.length > 0 ? (
                        zones.map((zone) => {
                            const info = ZONES[zone.zone_code] || { name: zone.zone_name, area: '' };
                            const status = getStatus(zone.percent || 0);
                            
                            return (
                                <article 
                                    key={zone.zone_code} 
                                    className="zone-card"
                                    data-status={status.key}
                                >
                                    <div className="zone-top">
                                        <div className="zone-info">
                                            <h3 className="zone-name">{info.name}</h3>
                                            <p className="zone-area">{info.area}</p>
                                        </div>
                                        <div className="zone-count">
                                            <span className="zone-count-value">{zone.people_count.toLocaleString()}</span>
                                            <span className="zone-count-unit">คน</span>
                                        </div>
                                    </div>
                                    
                                    <div className="zone-status">
                                        <p className="zone-status-text">{status.text}</p>
                                        <span className="zone-badge" data-status={status.key}>
                                            {status.label}
                                        </span>
                                    </div>
                                </article>
                            );
                        })
                    ) : (
                        <p className="no-data">ยังไม่มีข้อมูลโซนในขณะนี้</p>
                    )}
                </div>
            </section>

            {/* Disclaimer - ข้อความที่เป็นมิตร */}
            <aside className="disclaimer">
                <center><p className="disclaimer-text">
                     ข้อมูลนี้เป็นการประเมินจากระบบอัตโนมัติ อาจมีความคลาดเคลื่อนจากสถานการณ์จริง
                </p></center>
            </aside>
        </div>
    );
}
