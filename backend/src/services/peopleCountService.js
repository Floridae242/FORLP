import { config } from '../config/index.js';
import { getDb } from '../db/index.js';

// AI Service URL
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// In-memory current count (updated by AI or polling)
let currentPeopleCount = 0;
let lastUpdated = null;

/**
 * รับข้อมูลจาก AI Service (Ingest)
 */
export function ingestPeopleCount(count, timestamp) {
    currentPeopleCount = count;
    lastUpdated = timestamp || new Date().toISOString();
    
    // บันทึกลง Database (สำหรับ Report)
    try {
        const db = getDb();
        db.prepare(`
            INSERT INTO people_counts (count, recorded_at)
            VALUES (?, ?)
        `).run(count, lastUpdated);
    } catch (error) {
        console.error('[PeopleCount] Save error:', error.message);
    }
    
    return { success: true, count: currentPeopleCount, timestamp: lastUpdated };
}

/**
 * ดึงจำนวนคนปัจจุบัน (Real-time)
 */
export function getCurrentCount() {
    return {
        count: currentPeopleCount,
        timestamp: lastUpdated
    };
}

/**
 * ดึงข้อมูลจาก AI Service
 */
export async function fetchFromAI() {
    try {
        const response = await fetch(`${AI_SERVICE_URL}/api/people-count`, {
            signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
            throw new Error(`AI Service Error: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            ingestPeopleCount(result.data.people_count, result.data.last_updated);
            return { success: true, source: 'ai' };
        }
        
        throw new Error('AI Service returned error');
    } catch (error) {
        console.error('[PeopleCount] AI fetch error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * สร้าง Mock Data (สำหรับ Demo)
 */
export function generateMockCount() {
    const hour = new Date().getHours();
    let base = 50;
    
    // จำลองความหนาแน่นตามเวลา
    if (hour >= 17 && hour <= 21) {
        base = 150 + Math.floor(Math.random() * 100); // 150-250
    } else if (hour >= 14 && hour < 17) {
        base = 80 + Math.floor(Math.random() * 50);   // 80-130
    } else {
        base = 20 + Math.floor(Math.random() * 40);   // 20-60
    }
    
    currentPeopleCount = base;
    lastUpdated = new Date().toISOString();
    
    return { count: currentPeopleCount, timestamp: lastUpdated };
}

/**
 * สรุปข้อมูลรายวัน (สำหรับ Report)
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
        
        return result || {
            date: targetDate,
            max_people: 0,
            avg_people: 0,
            min_people: 0,
            total_samples: 0
        };
    } catch (error) {
        console.error('[PeopleCount] Daily summary error:', error.message);
        return null;
    }
}

/**
 * ดึงข้อมูลย้อนหลังหลายวัน (สำหรับ Report)
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
 * ดึงข้อมูลรายชั่วโมง (สำหรับ Report)
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

export const peopleCountService = {
    ingestPeopleCount,
    getCurrentCount,
    fetchFromAI,
    generateMockCount,
    getDailySummary,
    getHistoricalData,
    getHourlyData
};

export default peopleCountService;
