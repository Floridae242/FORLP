/* =====================================================
   Daily Report Service - สร้างรายงานประจำวัน
   รวมข้อมูลจำนวนคน + สภาพอากาศ + PM2.5
   ===================================================== */

import { config } from '../config/index.js';
import { queries } from '../db/index.js';
import { weatherService } from './weatherService.js';
import { peopleCountService } from './peopleCountService.js';

/**
 * สร้างรายงานประจำวัน
 */
export async function generateDailyReport(date = null) {
    const reportDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`[DailyReport] Generating report for ${reportDate}`);
    
    try {
        // 1. ดึงสรุปจำนวนคน (รวมทุกกล้องเป็นค่าเดียว)
        const peopleSummary = peopleCountService.getDailySummary(reportDate);
        
        // 2. ดึงข้อมูล Weather และ PM2.5
        const weatherData = await getWeatherSummary();
        
        // 3. สร้าง report data (ไม่มี Zone แล้ว - รวมเป็นค่าเดียว)
        const reportData = {
            report_date: reportDate,
            max_people: peopleSummary.max_people || 0,
            avg_people: peopleSummary.avg_people || 0,
            min_people: peopleSummary.min_people || 0,
            total_samples: peopleSummary.total_samples || 0,
            weather_summary: weatherData.description || 'ไม่มีข้อมูล',
            temperature_avg: weatherData.temperature || null,
            humidity_avg: weatherData.humidity || null,
            pm25_avg: weatherData.pm25 || null,
            pm25_status: weatherData.pm25Level || 'ไม่มีข้อมูล'
        };
        
        // 4. บันทึกลง Database
        queries.saveDailyReport(reportData);
        
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
            pm25Level: getPM25StatusText(pm25Value)
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
 * แปลงค่า PM2.5 เป็นสถานะภาษาไทย (ตาม Master Prompt: ดี / ปานกลาง / เสี่ยง)
 */
function getPM25StatusText(pm25) {
    if (pm25 === null || pm25 === undefined) return 'ไม่มีข้อมูล';
    if (pm25 <= 25) return 'ดี';
    if (pm25 <= 50) return 'ปานกลาง';
    return 'เสี่ยง';
}

/**
 * ประเมินความเสี่ยง PM2.5 (สำหรับ Early Warning)
 */
export function assessPM25Risk(pm25) {
    if (pm25 === null || pm25 === undefined) return { risk: false, level: 'unknown' };
    if (pm25 > 50) return { risk: true, level: 'high', message: 'PM2.5 สูงกว่ามาตรฐาน' };
    if (pm25 > 37) return { risk: true, level: 'moderate', message: 'PM2.5 เริ่มสูง' };
    return { risk: false, level: 'safe', message: 'คุณภาพอากาศดี' };
}

/**
 * สร้างข้อความสำหรับส่ง LINE - รายงานประจำวัน
 */
export function createLineMessage(report) {
    const date = new Date(report.report_date);
    const dateStr = date.toLocaleDateString('th-TH', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    });
    
    const message = ` รายงานกาดกองต้า ประจำวัน
${dateStr}

 จำนวนผู้ใช้งานพื้นที่
• สูงสุด: ${(report.max_people || 0).toLocaleString()} คน
• เฉลี่ย: ${(report.avg_people || 0).toLocaleString()} คน
• ต่ำสุด: ${(report.min_people || 0).toLocaleString()} คน

🌦 สภาพอากาศ: ${report.weather_summary || 'ไม่มีข้อมูล'}${report.temperature_avg ? ` (${report.temperature_avg}°C)` : ''}

🌫 PM2.5: ${report.pm25_avg ? `${report.pm25_avg} µg/m³` : 'ไม่มีข้อมูล'} (${report.pm25_status || 'ไม่มีข้อมูล'})


ข้อมูลนี้ใช้เพื่อสนับสนุนการตัดสินใจของเทศบาล
 Kad Kong Ta Smart Insight`;

    return message;
}

/**
 * สร้างข้อความ Early Warning สำหรับ LINE
 */
export function createEarlyWarningMessage(weatherData) {
    const warnings = [];
    
    if (weatherData.rainRisk) {
        warnings.push('🌧 มีความเสี่ยงฝนตก');
    }
    
    if (weatherData.pm25Risk) {
        warnings.push(`🌫 PM2.5 สูง (${weatherData.pm25} µg/m³)`);
    }
    
    if (warnings.length === 0) return null;
    
    const message = ` แจ้งเตือนสภาพอากาศวันนี้

${warnings.join('\n')}

💡 คำแนะนำ:
${weatherData.rainRisk ? '• เตรียมอุปกรณ์กันฝน\n' : ''}${weatherData.pm25Risk ? '• สวมหน้ากากอนามัย\n• หลีกเลี่ยงกิจกรรมกลางแจ้งเป็นเวลานาน\n' : ''}

 Kad Kong Ta Smart Insight`;

    return message;
}

/**
 * ส่งรายงานไป LINE OA
 */
export async function sendLineMessage(message) {
    if (!config.lineChannelAccessToken) {
        console.warn('[LINE] LINE not configured - skipping notification');
        return { success: false, error: 'LINE not configured' };
    }
    
    try {
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
        
        console.log('[LINE] Message sent successfully');
        return { success: true };
    } catch (error) {
        console.error('[LINE] Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ส่ง Daily Report ไป LINE OA
 */
export async function sendDailyReportToLine(report) {
    const message = createLineMessage(report);
    
    const result = await sendLineMessage(message);
    
    if (result.success) {
        // บันทึก log
        try {
            queries.logLineBroadcast({
                report_date: report.report_date,
                message_type: 'daily_report',
                message_content: message,
                status: 'sent',
                error_message: null
            });
            queries.markReportSentLine(report.report_date);
        } catch (e) {
            console.warn('[LINE] Failed to log broadcast:', e.message);
        }
    }
    
    return result;
}

/**
 * ส่ง Early Warning ไป LINE OA
 */
export async function sendEarlyWarningToLine(weatherData) {
    const message = createEarlyWarningMessage(weatherData);
    
    if (!message) {
        console.log('[EarlyWarning] No warnings to send');
        return { success: true, message: 'No warnings' };
    }
    
    const result = await sendLineMessage(message);
    
    if (result.success) {
        try {
            queries.logLineBroadcast({
                report_date: new Date().toISOString().split('T')[0],
                message_type: 'early_warning',
                message_content: message,
                status: 'sent',
                error_message: null
            });
        } catch (e) {
            console.warn('[LINE] Failed to log broadcast:', e.message);
        }
    }
    
    return result;
}

/**
 * สร้างและส่งรายงานประจำวัน (เรียกจาก scheduler)
 */
export async function processAndSendDailyReport(date = null) {
    const reportDate = date || new Date().toISOString().split('T')[0];
    
    // ตรวจสอบว่าส่งไปแล้วหรือยัง
    try {
        if (queries.isReportSentLine(reportDate)) {
            console.log(`[DailyReport] Report for ${reportDate} already sent to LINE`);
            return { success: true, message: 'Already sent' };
        }
    } catch (e) {
        // ถ้าไม่มี function นี้ ก็ข้ามไป
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
 * ตรวจสอบและส่ง Early Warning (เรียกจาก scheduler)
 */
export async function processEarlyWarning() {
    try {
        // ดึงข้อมูลสภาพอากาศ
        const [weather, airQuality] = await Promise.all([
            weatherService.getCurrentWeather(),
            weatherService.getAirQuality()
        ]);
        
        const pm25 = airQuality.data?.components?.pm2_5?.value || null;
        const rainProbability = weather.data?.rain?.probability || 0;
        const weatherDesc = weather.data?.weather?.description?.toLowerCase() || '';
        
        // ประเมินความเสี่ยง
        const rainRisk = rainProbability > 50 || 
                         weatherDesc.includes('rain') || 
                         weatherDesc.includes('ฝน');
        const pm25Risk = pm25 !== null && pm25 > 50;
        
        if (!rainRisk && !pm25Risk) {
            console.log('[EarlyWarning] No risks detected');
            return { success: true, message: 'No warnings needed' };
        }
        
        // ส่งแจ้งเตือน
        const result = await sendEarlyWarningToLine({
            rainRisk,
            pm25Risk,
            pm25,
            temperature: weather.data?.temperature?.current
        });
        
        return result;
    } catch (error) {
        console.error('[EarlyWarning] Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ดึงรายงานล่าสุด
 */
export function getLatestReport() {
    try {
        return queries.getLatestDailyReport();
    } catch (e) {
        return null;
    }
}

/**
 * ดึงรายงานตามวันที่
 */
export function getReportByDate(date) {
    try {
        return queries.getDailyReport(date);
    } catch (e) {
        return null;
    }
}

/**
 * ดึงรายงานย้อนหลัง
 */
export function getRecentReports(limit = 7) {
    try {
        return queries.getDailyReports(limit);
    } catch (e) {
        return [];
    }
}

export const dailyReportService = {
    generateDailyReport,
    createLineMessage,
    createEarlyWarningMessage,
    sendLineMessage,
    sendDailyReportToLine,
    sendEarlyWarningToLine,
    processAndSendDailyReport,
    processEarlyWarning,
    assessPM25Risk,
    getLatestReport,
    getReportByDate,
    getRecentReports
};

export default dailyReportService;
