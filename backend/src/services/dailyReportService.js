// =====================================================
// Kad Kong Ta Smart Insight - Daily Report Service
// สรุปข้อมูลประจำวันและส่ง LINE OA
// =====================================================

import { config } from '../config/index.js';
import { queries } from '../db/index.js';
import { weatherService } from './weatherService.js';
import { peopleCountService } from './peopleCountService.js';

// ชื่อโซนแบบมนุษย์
const ZONE_NAMES = {
    'A': 'โซนหน้าตลาด',
    'B': 'โซนกลาง',
    'C': 'โซนท้ายตลาด'
};

/**
 * สร้างรายงานประจำวัน
 */
export async function generateDailyReport(date = null) {
    const reportDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`[DailyReport] Generating report for ${reportDate}`);
    
    try {
        // 1. ดึงสรุปจำนวนคนแต่ละ Zone
        const peopleSummary = queries.getDailyPeopleSummary(reportDate);
        
        // 2. ดึงข้อมูล Weather และ PM2.5
        const weatherData = await getWeatherSummary();
        
        // 3. สร้าง report data
        const zoneA = peopleSummary.find(z => z.zone_code === 'A') || { total_count: 0, peak_count: 0 };
        const zoneB = peopleSummary.find(z => z.zone_code === 'B') || { total_count: 0, peak_count: 0 };
        const zoneC = peopleSummary.find(z => z.zone_code === 'C') || { total_count: 0, peak_count: 0 };
        
        const reportData = {
            report_date: reportDate,
            zone_a_total: zoneA.total_count || 0,
            zone_a_peak: zoneA.peak_count || 0,
            zone_b_total: zoneB.total_count || 0,
            zone_b_peak: zoneB.peak_count || 0,
            zone_c_total: zoneC.total_count || 0,
            zone_c_peak: zoneC.peak_count || 0,
            weather_summary: weatherData.description || 'ไม่มีข้อมูล',
            temperature_avg: weatherData.temperature || null,
            pm25_avg: weatherData.pm25 || null,
            pm25_max: weatherData.pm25 || null,
            pm25_level: weatherData.pm25Level || 'ไม่มีข้อมูล'
        };
        
        // 4. บันทึกลง Database
        queries.createDailyReport(reportData);
        
        console.log(`[DailyReport] Report saved for ${reportDate}`);
        
        return {
            success: true,
            data: reportData
        };
    } catch (error) {
        console.error('[DailyReport] Generate Error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ดึงสรุปสภาพอากาศ
 */
async function getWeatherSummary() {
    try {
        const [weather, airQuality] = await Promise.all([
            weatherService.getCurrentWeather(),
            weatherService.getAirQuality()
        ]);
        
        const pm25Value = airQuality.data?.components?.pm2_5?.value || null;
        
        return {
            temperature: weather.data?.temperature?.current || null,
            description: weather.data?.weather?.description || 'ไม่มีข้อมูล',
            humidity: weather.data?.humidity || null,
            pm25: pm25Value,
            pm25Level: getPM25LevelText(pm25Value)
        };
    } catch (error) {
        console.error('[DailyReport] Weather Error:', error.message);
        return {
            temperature: null,
            description: 'ไม่สามารถดึงข้อมูลได้',
            humidity: null,
            pm25: null,
            pm25Level: 'ไม่มีข้อมูล'
        };
    }
}

/**
 * แปลงค่า PM2.5 เป็นระดับภาษาไทย
 */
function getPM25LevelText(pm25) {
    if (pm25 === null || pm25 === undefined) return 'ไม่มีข้อมูล';
    if (pm25 <= 25) return 'ดีมาก';
    if (pm25 <= 37) return 'ดี';
    if (pm25 <= 50) return 'ปานกลาง';
    if (pm25 <= 90) return 'เริ่มมีผลต่อสุขภาพ';
    if (pm25 <= 150) return 'มีผลต่อสุขภาพ';
    return 'อันตราย';
}

/**
 * สร้างข้อความสำหรับส่ง LINE (ใช้ชื่อโซนแบบมนุษย์)
 */
export function createLineMessage(report) {
    const date = new Date(report.report_date);
    const dateStr = date.toLocaleDateString('th-TH', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    });
    
    // คำนวณยอดรวม
    const totalPeople = (report.zone_a_peak || 0) + (report.zone_b_peak || 0) + (report.zone_c_peak || 0);
    
    const message = `📊 รายงานกาดก้องตา ประจำวัน
${dateStr}

👥 จำนวนผู้ใช้งานพื้นที่ (สูงสุด)
• ${ZONE_NAMES['A']}: ${(report.zone_a_peak || 0).toLocaleString()} คน
• ${ZONE_NAMES['B']}: ${(report.zone_b_peak || 0).toLocaleString()} คน
• ${ZONE_NAMES['C']}: ${(report.zone_c_peak || 0).toLocaleString()} คน
• รวม: ${totalPeople.toLocaleString()} คน

🌦 สภาพอากาศ: ${report.weather_summary || 'ไม่มีข้อมูล'}${report.temperature_avg ? ` (${report.temperature_avg}°C)` : ''}

🌫 PM2.5: ${report.pm25_avg ? `${report.pm25_avg} µg/m³` : 'ไม่มีข้อมูล'} (${report.pm25_level || 'ไม่มีข้อมูล'})

━━━━━━━━━━━━━━━
ข้อมูลนี้ใช้เพื่อสนับสนุนการตัดสินใจของเทศบาล
🏮 Kad Kong Ta Smart Insight`;

    return message;
}

/**
 * ส่งรายงานไป LINE OA
 */
export async function sendDailyReportToLine(report) {
    if (!config.lineChannelAccessToken) {
        console.warn('[DailyReport] LINE not configured - skipping LINE notification');
        return { success: false, error: 'LINE not configured' };
    }
    
    const message = createLineMessage(report);
    
    try {
        // Broadcast to all followers
        const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.lineChannelAccessToken}`
            },
            body: JSON.stringify({
                messages: [{ type: 'text', text: message }]
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `LINE API Error: ${response.status}`);
        }
        
        // บันทึก log และอัพเดทสถานะ
        queries.logLineBroadcast({
            report_date: report.report_date,
            message_content: message,
            status: 'sent',
            error_message: null
        });
        
        queries.markReportSentLine(report.report_date);
        
        console.log(`[DailyReport] LINE broadcast sent for ${report.report_date}`);
        
        return { success: true };
    } catch (error) {
        console.error('[DailyReport] LINE Error:', error.message);
        
        // บันทึก error log
        queries.logLineBroadcast({
            report_date: report.report_date,
            message_content: message,
            status: 'failed',
            error_message: error.message
        });
        
        return { success: false, error: error.message };
    }
}

/**
 * สร้างและส่งรายงานประจำวัน (เรียกจาก scheduler)
 */
export async function processAndSendDailyReport(date = null) {
    const reportDate = date || new Date().toISOString().split('T')[0];
    
    // ตรวจสอบว่าส่งไปแล้วหรือยัง
    if (queries.isReportSentLine(reportDate)) {
        console.log(`[DailyReport] Report for ${reportDate} already sent to LINE`);
        return { success: true, message: 'Already sent' };
    }
    
    // สร้างรายงาน
    const reportResult = await generateDailyReport(reportDate);
    if (!reportResult.success) {
        return reportResult;
    }
    
    // ส่งไป LINE
    const lineResult = await sendDailyReportToLine(reportResult.data);
    
    return {
        success: lineResult.success,
        report: reportResult.data,
        lineStatus: lineResult.success ? 'sent' : lineResult.error
    };
}

/**
 * ดึงรายงานล่าสุด
 */
export function getLatestReport() {
    return queries.getLatestDailyReport();
}

/**
 * ดึงรายงานตามวันที่
 */
export function getReportByDate(date) {
    return queries.getDailyReport(date);
}

/**
 * ดึงรายงานย้อนหลัง
 */
export function getRecentReports(limit = 7) {
    return queries.getDailyReports(limit);
}

export const dailyReportService = {
    generateDailyReport,
    createLineMessage,
    sendDailyReportToLine,
    processAndSendDailyReport,
    getLatestReport,
    getReportByDate,
    getRecentReports
};

export default dailyReportService;
