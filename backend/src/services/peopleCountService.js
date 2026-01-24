// =====================================================
// Kad Kong Ta Smart Insight - People Count Service
// ดึงข้อมูลจำนวนคนจาก API หรือ Mock Data
// =====================================================

import { config } from '../config/index.js';
import { queries } from '../db/index.js';

// Zone ที่ต้องการ (เฉพาะ A, B, C)
const VALID_ZONES = ['A', 'B', 'C'];

/**
 * ดึงข้อมูลจำนวนคนจาก Camera API
 * ถ้าไม่มี API จะใช้ Mock Data
 */
export async function fetchPeopleCounts() {
    // ถ้ามี Camera API ให้ดึงจาก API จริง
    if (config.cameraApiUrl && !config.mockMode) {
        try {
            return await fetchFromCameraAPI();
        } catch (error) {
            console.error('[PeopleCount] API Error:', error.message);
            console.log('[PeopleCount] Falling back to mock data');
        }
    }
    
    // ใช้ Mock Data
    return generateMockPeopleCounts();
}

/**
 * ดึงข้อมูลจาก Camera API จริง
 */
async function fetchFromCameraAPI() {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (config.cameraApiKey) {
        headers['Authorization'] = `Bearer ${config.cameraApiKey}`;
    }
    
    const response = await fetch(`${config.cameraApiUrl}/people-count`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
        throw new Error(`Camera API Error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Normalize data to our format
    return normalizeAPIData(data);
}

/**
 * แปลงข้อมูลจาก API ให้อยู่ในรูปแบบมาตรฐาน
 */
function normalizeAPIData(data) {
    const zones = queries.getAllZones().filter(z => VALID_ZONES.includes(z.zone_code));
    const timestamp = new Date().toISOString();
    
    return zones.map(zone => {
        // หา data ของ zone นี้จาก API response
        const zoneData = Array.isArray(data) 
            ? data.find(d => d.zone === zone.zone_code || d.zone_code === zone.zone_code)
            : data[zone.zone_code];
        
        return {
            zone_code: zone.zone_code,
            zone_name: zone.zone_name,
            people_count: zoneData?.people_count || zoneData?.count || 0,
            capacity: zone.capacity,
            recorded_at: timestamp
        };
    });
}

/**
 * สร้าง Mock Data สำหรับ Demo (เฉพาะ Zone A, B, C)
 */
function generateMockPeopleCounts() {
    const timestamp = new Date().toISOString();
    const hour = new Date().getHours();
    
    // จำลองความหนาแน่นตามเวลา
    // ช่วงเย็น (17:00-21:00) คนเยอะ, ช่วงเช้าคนน้อย
    let multiplier = 0.3; // ค่าเริ่มต้น
    
    if (hour >= 17 && hour <= 21) {
        multiplier = 0.7 + Math.random() * 0.25; // 70-95%
    } else if (hour >= 14 && hour < 17) {
        multiplier = 0.4 + Math.random() * 0.2; // 40-60%
    } else if (hour >= 10 && hour < 14) {
        multiplier = 0.2 + Math.random() * 0.2; // 20-40%
    } else {
        multiplier = 0.05 + Math.random() * 0.15; // 5-20%
    }
    
    // Zone data แบบ hardcoded (ไม่ต้องพึ่ง DB)
    const zoneData = [
        { zone_code: 'A', zone_name: 'โซน A - ทางเข้าหลัก', capacity: 500 },
        { zone_code: 'B', zone_name: 'โซน B - ตลาดกลาง', capacity: 800 },
        { zone_code: 'C', zone_name: 'โซน C - โซนอาหาร', capacity: 600 }
    ];
    
    return zoneData.map(zone => {
        // เพิ่มความแปรปรวนแต่ละ zone
        const zoneMultiplier = multiplier * (0.8 + Math.random() * 0.4);
        const peopleCount = Math.floor(zone.capacity * zoneMultiplier);
        
        return {
            zone_code: zone.zone_code,
            zone_name: zone.zone_name,
            people_count: peopleCount,
            capacity: zone.capacity,
            recorded_at: timestamp
        };
    });
}

/**
 * บันทึกข้อมูลจำนวนคนลง Database
 */
export function savePeopleCounts(data) {
    try {
        // Filter เฉพาะ Zone A, B, C
        const validData = data.filter(d => VALID_ZONES.includes(d.zone_code));
        queries.insertPeopleCounts(validData);
        return { success: true, count: validData.length };
    } catch (error) {
        console.error('[PeopleCount] Save Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ดึงข้อมูลล่าสุดของแต่ละ Zone
 */
export function getLatestCounts() {
    try {
        const data = queries.getLatestPeopleCounts();
        
        // Filter เฉพาะ Zone A, B, C
        const filteredData = data.filter(d => VALID_ZONES.includes(d.zone_code));
        
        if (!filteredData || filteredData.length === 0) {
            // ถ้าไม่มีข้อมูลใน DB ให้ return mock
            return generateMockPeopleCounts();
        }
        
        return filteredData.map(d => ({
            zone_code: d.zone_code,
            zone_name: d.zone_name,
            people_count: d.people_count,
            capacity: d.capacity,
            recorded_at: d.recorded_at
        }));
    } catch (error) {
        console.error('[PeopleCount] Get Latest Error:', error.message);
        return generateMockPeopleCounts();
    }
}

/**
 * ดึงสรุปจำนวนคนประจำวัน
 */
export function getDailySummary(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
        const data = queries.getDailyPeopleSummary(targetDate);
        // Filter เฉพาะ Zone A, B, C
        return data.filter(d => VALID_ZONES.includes(d.zone_code));
    } catch (error) {
        console.error('[PeopleCount] Daily Summary Error:', error.message);
        return [];
    }
}

export const peopleCountService = {
    fetchPeopleCounts,
    savePeopleCounts,
    getLatestCounts,
    getDailySummary,
    generateMockPeopleCounts
};

export default peopleCountService;
