// filepath: /Users/floridae/Desktop/FORLP/backend/src/services/peopleCountService.js
/* =====================================================
   People Count Service - ระบบนับจำนวนคนจาก AI
   - รับข้อมูลจาก AI Service (YOLOv8)
   - คำนวณ smoothed count (EMA)
   - กำหนด status ตาม threshold
   - ส่ง alert เมื่อแออัด
   ===================================================== */

import { getDb } from '../db/index.js';

// =====================================================
// CONFIGURATION
// =====================================================

// Threshold สำหรับ status (ตาม PROMPT)
const STATUS_THRESHOLDS = {
    NORMAL: { min: 0, max: 99, key: 'normal', label: 'ปกติ' },
    MODERATE: { min: 100, max: 299, key: 'moderate', label: 'ปานกลาง' },
    BUSY: { min: 300, max: 599, key: 'busy', label: 'ค่อนข้างหนาแน่น' },
    CROWDED: { min: 600, max: Infinity, key: 'crowded', label: 'หนาแน่นมาก' }
};

// Alert thresholds
const ALERT_THRESHOLDS = {
    CROWD_WARNING: 300,    // ส่ง warning เมื่อ >= 300
    CROWD_CRITICAL: 600    // ส่ง critical เมื่อ >= 600
};

// EMA smoothing factor (0.1 = smooth, 0.5 = responsive)
const EMA_ALPHA = 0.3;

// Alert cooldown (milliseconds) - ป้องกันการส่งซ้ำ
const ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 นาที

// Staleness threshold (seconds)
const STALENESS_THRESHOLD_S = 120; // 2 นาที

// =====================================================
// IN-MEMORY STATE
// =====================================================

// ข้อมูลปัจจุบัน (aggregated จากทุกกล้อง)
let currentState = {
    count: 0,
    smoothed_count: 0,
    max_count: 0,
    status: 'normal',
    status_label: 'ปกติ',
    timestamp: null,
    source: 'none',
    source_latency_s: 0
};

// ข้อมูลแยกตามกล้อง
const cameraData = new Map();

// History สำหรับ real-time chart (เก็บ 60 records)
const realtimeHistory = [];
const MAX_HISTORY_LENGTH = 60;

// Alert tracking (ป้องกันส่งซ้ำ)
const lastAlerts = {
    crowd_warning: null,
    crowd_critical: null,
    rain_warning: null
};

// Alert callbacks (จะถูก set จาก index.js)
let alertCallbacks = {
    onCrowdWarning: null,
    onCrowdCritical: null
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * คำนวณ status จาก count
 */
function calculateStatus(count) {
    if (count >= STATUS_THRESHOLDS.CROWDED.min) {
        return { key: 'crowded', label: 'หนาแน่นมาก' };
    }
    if (count >= STATUS_THRESHOLDS.BUSY.min) {
        return { key: 'busy', label: 'ค่อนข้างหนาแน่น' };
    }
    if (count >= STATUS_THRESHOLDS.MODERATE.min) {
        return { key: 'moderate', label: 'ปานกลาง' };
    }
    return { key: 'normal', label: 'ปกติ' };
}

/**
 * คำนวณ EMA (Exponential Moving Average)
 */
function calculateEMA(newValue, previousEMA, alpha = EMA_ALPHA) {
    if (previousEMA === null || previousEMA === undefined) {
        return newValue;
    }
    return alpha * newValue + (1 - alpha) * previousEMA;
}

/**
 * คำนวณ source latency (วินาที)
 */
function calculateLatency(timestamp) {
    if (!timestamp) return 0;
    const now = new Date();
    const ts = new Date(timestamp);
    return Math.round((now - ts) / 1000);
}

/**
 * ตรวจสอบว่าควรส่ง alert หรือไม่ (cooldown)
 */
function shouldSendAlert(alertType) {
    const lastSent = lastAlerts[alertType];
    if (!lastSent) return true;
    
    const elapsed = Date.now() - lastSent;
    return elapsed >= ALERT_COOLDOWN_MS;
}

/**
 * บันทึกเวลาที่ส่ง alert
 */
function markAlertSent(alertType) {
    lastAlerts[alertType] = Date.now();
}

// =====================================================
// MAIN FUNCTIONS
// =====================================================

/**
 * รับข้อมูลจาก AI Service (Ingest)
 * ตาม PROMPT: POST /api/people/ingest
 */
export function ingestPeopleCount(data) {
    const {
        stream_id = 'unknown',
        camera_id = null,
        timestamp = new Date().toISOString(),
        people_count = 0,
        smoothed_count = null,
        max_count = null,
        avg_count = null,
        frames_processed = 0,
        source_type = 'playback',
        confidence = 0,
        window_start = null,
        window_end = null
    } = data;

    const cameraKey = camera_id || stream_id;
    const now = new Date().toISOString();

    // ดึงข้อมูลเดิมของกล้อง (ถ้ามี)
    const prevCameraData = cameraData.get(cameraKey);
    const prevSmoothed = prevCameraData?.smoothed_count || 0;

    // คำนวณ smoothed count (EMA)
    const newSmoothed = smoothed_count !== null 
        ? smoothed_count 
        : Math.round(calculateEMA(people_count, prevSmoothed));

    // อัปเดตข้อมูลกล้อง
    const cameraRecord = {
        camera_id: cameraKey,
        raw_count: people_count,
        smoothed_count: newSmoothed,
        max_count: max_count || people_count,
        avg_count: avg_count || people_count,
        frames_processed,
        source_type,
        confidence,
        window_start,
        window_end,
        timestamp,
        updated_at: now
    };
    cameraData.set(cameraKey, cameraRecord);

    // คำนวณ aggregate (รวมทุกกล้อง)
    let totalSmoothed = 0;
    let totalMax = 0;
    let latestTimestamp = null;

    for (const cam of cameraData.values()) {
        totalSmoothed += cam.smoothed_count || 0;
        totalMax += cam.max_count || 0;
        if (!latestTimestamp || cam.timestamp > latestTimestamp) {
            latestTimestamp = cam.timestamp;
        }
    }

    // คำนวณ status
    const status = calculateStatus(totalSmoothed);
    const latency = calculateLatency(latestTimestamp);

    // อัปเดต current state
    currentState = {
        count: totalSmoothed,
        smoothed_count: totalSmoothed,
        max_count: totalMax,
        status: status.key,
        status_label: status.label,
        timestamp: latestTimestamp,
        source: source_type,
        source_latency_s: latency,
        camera_count: cameraData.size,
        updated_at: now
    };

    // เพิ่มใน history
    realtimeHistory.push({
        count: totalSmoothed,
        status: status.key,
        timestamp: now,
        camera_id: cameraKey
    });

    // จำกัดขนาด history
    while (realtimeHistory.length > MAX_HISTORY_LENGTH) {
        realtimeHistory.shift();
    }

    // บันทึกลง Database
    saveToDatabase(totalSmoothed, now, cameraKey, source_type);

    // ตรวจสอบและส่ง alert
    checkAndTriggerAlerts(totalSmoothed, status);

    console.log(`[PeopleCount] Ingested: ${cameraKey} = ${people_count} → smoothed=${newSmoothed}, total=${totalSmoothed} (${status.label})`);

    return {
        success: true,
        data: {
            camera_id: cameraKey,
            raw_count: people_count,
            smoothed_count: newSmoothed,
            total_count: totalSmoothed,
            status: status.key,
            status_label: status.label,
            timestamp: now
        }
    };
}

/**
 * บันทึกลง Database
 */
function saveToDatabase(count, timestamp, cameraId, sourceType) {
    try {
        const db = getDb();
        
        // บันทึก people_counts (aggregate)
        db.prepare(`
            INSERT INTO people_counts (count, recorded_at, source)
            VALUES (?, ?, ?)
        `).run(count, timestamp, sourceType);

        // บันทึก ai_people_counts (per camera) - ถ้ามี table
        try {
            const camData = cameraData.get(cameraId);
            if (camData) {
                db.prepare(`
                    INSERT INTO ai_people_counts 
                    (camera_id, max_people, avg_people, min_people, frames_processed, 
                     window_start, window_end, source_type, recorded_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    cameraId,
                    camData.max_count,
                    camData.avg_count,
                    camData.raw_count,
                    camData.frames_processed,
                    camData.window_start,
                    camData.window_end,
                    sourceType,
                    timestamp
                );
            }
        } catch (e) {
            // Table อาจยังไม่มี
        }
    } catch (error) {
        console.error('[PeopleCount] Database save error:', error.message);
    }
}

/**
 * ตรวจสอบและ trigger alerts
 */
function checkAndTriggerAlerts(smoothedCount, status) {
    // Critical Alert (>= 600)
    if (smoothedCount >= ALERT_THRESHOLDS.CROWD_CRITICAL) {
        if (shouldSendAlert('crowd_critical')) {
            console.log(`[PeopleCount]  CRITICAL ALERT: ${smoothedCount} people`);
            markAlertSent('crowd_critical');
            
            if (alertCallbacks.onCrowdCritical) {
                alertCallbacks.onCrowdCritical({
                    count: smoothedCount,
                    status: status.key,
                    status_label: status.label,
                    timestamp: new Date().toISOString()
                });
            }
        }
        return;
    }

    // Warning Alert (>= 300)
    if (smoothedCount >= ALERT_THRESHOLDS.CROWD_WARNING) {
        if (shouldSendAlert('crowd_warning')) {
            console.log(`[PeopleCount]  CROWD WARNING: ${smoothedCount} people`);
            markAlertSent('crowd_warning');
            
            if (alertCallbacks.onCrowdWarning) {
                alertCallbacks.onCrowdWarning({
                    count: smoothedCount,
                    status: status.key,
                    status_label: status.label,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
}

/**
 * ตั้งค่า alert callbacks
 */
export function setAlertCallbacks(callbacks) {
    alertCallbacks = { ...alertCallbacks, ...callbacks };
}

/**
 * ดึงจำนวนคนปัจจุบัน (GET /api/people/current)
 */
export function getCurrentCount() {
    const latency = calculateLatency(currentState.timestamp);
    const isStale = latency > STALENESS_THRESHOLD_S;

    return {
        count: currentState.count,
        smoothed_count: currentState.smoothed_count,
        max_count: currentState.max_count,
        status: currentState.status,
        status_label: currentState.status_label,
        timestamp: currentState.timestamp,
        source: isStale ? 'stale' : currentState.source,
        source_latency_s: latency,
        is_stale: isStale,
        camera_count: currentState.camera_count || 0,
        updated_at: currentState.updated_at
    };
}

/**
 * ดึงข้อมูลทุกกล้อง
 */
export function getAllCamerasData() {
    return Array.from(cameraData.values());
}

/**
 * ดึงข้อมูลกล้องเฉพาะตัว
 */
export function getCameraData(cameraId) {
    return cameraData.get(cameraId) || null;
}

/**
 * ดึง realtime history
 */
export function getRealtimeHistory(minutes = 30) {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    return realtimeHistory.filter(h => h.timestamp >= cutoff);
}

/**
 * ดึงสรุปรายวัน (GET /api/people/daily?date=YYYY-MM-DD)
 */
export function getDailySummary(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
        const db = getDb();
        const result = db.prepare(`
            SELECT 
                DATE(recorded_at) as date,
                MAX(count) as max_people,
                ROUND(AVG(count), 1) as avg_people,
                MIN(count) as min_people,
                COUNT(*) as total_samples
            FROM people_counts
            WHERE DATE(recorded_at) = ?
            GROUP BY DATE(recorded_at)
        `).get(targetDate);
        
        if (!result) {
            return {
                date: targetDate,
                max_people: 0,
                avg_people: 0,
                min_people: 0,
                total_samples: 0
            };
        }

        // คำนวณ status จาก max
        const status = calculateStatus(result.max_people);
        
        return {
            ...result,
            status: status.key,
            status_label: status.label
        };
    } catch (error) {
        console.error('[PeopleCount] Daily summary error:', error.message);
        return null;
    }
}

/**
 * ดึงสรุปรายวัน เฉพาะช่วงเวลาที่ตลาดเปิด (16:00-22:00 เวลาไทย)
 * เวลาไทย = UTC+7, ดังนั้น 16:00-22:00 ไทย = 09:00-15:00 UTC
 */
export function getDailySummaryMarketHours(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
        const db = getDb();
        // กรองเฉพาะเวลา 16:00-22:00 เวลาไทย (09:00-15:00 UTC)
        // strftime('%H', recorded_at) คืนค่าเป็น UTC
        // 16:00 ไทย = 09:00 UTC, 22:00 ไทย = 15:00 UTC
        const result = db.prepare(`
            SELECT 
                DATE(recorded_at) as date,
                MAX(count) as max_people,
                ROUND(AVG(count), 1) as avg_people,
                MIN(count) as min_people,
                COUNT(*) as total_samples
            FROM people_counts
            WHERE DATE(recorded_at) = ?
              AND CAST(strftime('%H', recorded_at) AS INTEGER) >= 9
              AND CAST(strftime('%H', recorded_at) AS INTEGER) < 15
            GROUP BY DATE(recorded_at)
        `).get(targetDate);
        
        if (!result) {
            return {
                date: targetDate,
                max_people: 0,
                avg_people: 0,
                min_people: 0,
                total_samples: 0,
                market_hours: '16:00-22:00'
            };
        }

        // คำนวณ status จาก max
        const status = calculateStatus(result.max_people);
        
        return {
            ...result,
            status: status.key,
            status_label: status.label,
            market_hours: '16:00-22:00'
        };
    } catch (error) {
        console.error('[PeopleCount] Daily summary (market hours) error:', error.message);
        return null;
    }
}

/**
 * ดึงข้อมูลย้อนหลังหลายวัน
 */
export function getHistoricalData(days = 7) {
    try {
        const db = getDb();
        return db.prepare(`
            SELECT 
                DATE(recorded_at) as date,
                MAX(count) as max_people,
                ROUND(AVG(count), 1) as avg_people,
                MIN(count) as min_people,
                COUNT(*) as total_samples
            FROM people_counts
            WHERE recorded_at >= datetime('now', '-' || ? || ' days')
            GROUP BY DATE(recorded_at)
            ORDER BY date DESC
        `).all(days);
    } catch (error) {
        console.error('[PeopleCount] Historical data error:', error.message);
        return [];
    }
}

/**
 * ดึงข้อมูลย้อนหลังหลายวัน เฉพาะช่วงเวลาที่ตลาดเปิด (16:00-22:00 เวลาไทย)
 * ใช้สำหรับรายงานรายสัปดาห์
 */
export function getHistoricalDataMarketHours(days = 7) {
    try {
        const db = getDb();
        // กรองเฉพาะเวลา 16:00-22:00 เวลาไทย (09:00-15:00 UTC)
        return db.prepare(`
            SELECT 
                DATE(recorded_at) as date,
                MAX(count) as max_people,
                ROUND(AVG(count), 1) as avg_people,
                MIN(count) as min_people,
                COUNT(*) as total_samples
            FROM people_counts
            WHERE recorded_at >= datetime('now', '-' || ? || ' days')
              AND CAST(strftime('%H', recorded_at) AS INTEGER) >= 9
              AND CAST(strftime('%H', recorded_at) AS INTEGER) < 15
            GROUP BY DATE(recorded_at)
            ORDER BY date DESC
        `).all(days);
    } catch (error) {
        console.error('[PeopleCount] Historical data (market hours) error:', error.message);
        return [];
    }
}

/**
 * ดึงข้อมูลรายชั่วโมง
 */
export function getHourlyData(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
        const db = getDb();
        return db.prepare(`
            SELECT 
                strftime('%H', recorded_at) as hour,
                MAX(count) as max_people,
                ROUND(AVG(count), 1) as avg_people,
                COUNT(*) as samples
            FROM people_counts
            WHERE DATE(recorded_at) = ?
            GROUP BY strftime('%H', recorded_at)
            ORDER BY hour
        `).all(targetDate);
    } catch (error) {
        console.error('[PeopleCount] Hourly data error:', error.message);
        return [];
    }
}

/**
 * ตรวจสอบระดับความแออัด
 */
export function checkCrowdLevel() {
    const count = currentState.smoothed_count;
    const status = calculateStatus(count);
    
    return {
        count,
        smoothed_count: currentState.smoothed_count,
        level: status.key,
        label: status.label,
        is_warning: count >= ALERT_THRESHOLDS.CROWD_WARNING,
        is_critical: count >= ALERT_THRESHOLDS.CROWD_CRITICAL,
        thresholds: ALERT_THRESHOLDS,
        timestamp: currentState.timestamp,
        source_latency_s: currentState.source_latency_s
    };
}

/**
 * ดึงสถิติล่าสุด (สำหรับ Dashboard)
 */
export function getLatestStats() {
    return {
        current: getCurrentCount(),
        today: getDailySummary(),
        hourly: getHourlyData(),
        crowdLevel: checkCrowdLevel(),
        cameras: getAllCamerasData(),
        history: getRealtimeHistory(30),
        thresholds: STATUS_THRESHOLDS,
        alert_thresholds: ALERT_THRESHOLDS
    };
}

/**
 * Reset alert cooldown (สำหรับ testing)
 */
export function resetAlertCooldown(alertType = null) {
    if (alertType) {
        lastAlerts[alertType] = null;
    } else {
        Object.keys(lastAlerts).forEach(key => {
            lastAlerts[key] = null;
        });
    }
}

/**
 * สร้าง Mock Data (สำหรับ fallback เท่านั้น)
 */
export function generateMockCount() {
    const hour = new Date().getHours();
    let base = 50;
    
    // จำลองความหนาแน่นตามเวลา
    if (hour >= 17 && hour <= 21) {
        base = 150 + Math.floor(Math.random() * 100);
    } else if (hour >= 14 && hour < 17) {
        base = 80 + Math.floor(Math.random() * 50);
    } else {
        base = 20 + Math.floor(Math.random() * 40);
    }
    
    // Ingest mock data
    return ingestPeopleCount({
        stream_id: 'mock',
        people_count: base,
        source_type: 'mock'
    });
}

// =====================================================
// EXPORTS
// =====================================================

export const peopleCountService = {
    // Ingest
    ingestPeopleCount,
    setAlertCallbacks,
    
    // Query
    getCurrentCount,
    getAllCamerasData,
    getCameraData,
    getRealtimeHistory,
    getDailySummary,
    getDailySummaryMarketHours,
    getHistoricalData,
    getHistoricalDataMarketHours,
    getHourlyData,
    checkCrowdLevel,
    getLatestStats,
    
    // Utilities
    calculateStatus,
    resetAlertCooldown,
    generateMockCount,
    
    // Constants
    STATUS_THRESHOLDS,
    ALERT_THRESHOLDS
};

export default peopleCountService;
