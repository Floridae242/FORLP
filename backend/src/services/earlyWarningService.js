// filepath: /Users/floridae/Desktop/FORLP/backend/src/services/earlyWarningService.js
/* =====================================================
   Early Warning Service - ระบบแจ้งเตือนล่วงหน้า
   
   ตาม PROMPT:
   1. Rain Forecast: ส่งแจ้งเตือนเมื่อพยากรณ์ฝนภายใน 60 นาที
   2. Crowd Warning: ส่งทันทีเมื่อคน >= 1,201 (warning) หรือ >= 2,501 (critical)
   3. Daily Report: ส่งทุกเสาร์-อาทิตย์ 23:00 น. (Asia/Bangkok)
   ===================================================== */

import { peopleCountService } from './peopleCountService.js';
import { config } from '../config/index.js';

// ช่วงเวลาตลาด (สำหรับ context)
const MARKET_START_HOUR = 14;
const MARKET_END_HOUR = 22;

// Rain forecast settings
const RAIN_FORECAST_MINUTES = 60;        // พยากรณ์ล่วงหน้า 60 นาที
const RAIN_PROBABILITY_THRESHOLD = 0.5;  // 50% probability
const RAIN_CHECK_INTERVAL_MS = 10 * 60 * 1000; // ตรวจสอบทุก 10 นาที

// Alert cooldown (ป้องกันส่งซ้ำ)
const ALERT_COOLDOWN = {
    rain_warning: 60 * 60 * 1000,      // 1 ชั่วโมง
    crowd_warning: 10 * 60 * 1000,     // 10 นาที
    crowd_critical: 5 * 60 * 1000      // 5 นาที (ส่งบ่อยกว่าเพราะ critical)
};

// LINE OA Configuration (จะถูก inject จาก index.js)
let lineMessageSender = null;

// Alert tracking
const lastAlerts = {
    rain_warning: null,
    crowd_warning: null,
    crowd_critical: null
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * ตรวจสอบว่าเป็นวันเสาร์-อาทิตย์หรือไม่
 */
export function isWeekend(date = new Date()) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

/**
 * ตรวจสอบว่าควรส่งแจ้งเตือนหรือไม่ (ถ้าไม่ใช่วันเปิดทำการ ห้ามส่ง)
 */
function shouldSendAlertsToday() {
    const bangkokTime = toBangkokTime();
    const isWeekendDay = isWeekend(bangkokTime);
    
    // แจ้งเตือนเฉพาะวันเสาร์ (6) และอาทิตย์ (0)
    if (!isWeekendDay) {
        const dayName = bangkokTime.toLocaleDateString('th-TH', { weekday: 'long', timeZone: 'Asia/Bangkok' });
        console.log(`[EarlyWarning] ⚠️  วันนี้คือ${dayName} - ห้ามส่งแจ้งเตือน (เปิดทำการเฉพาะเสาร์-อาทิตย์)`);
        return false;
    }
    
    return true;
}

/**
 * แปลงเวลาเป็น Asia/Bangkok
 */
function toBangkokTime(date = new Date()) {
    return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
}

/**
 * Format เวลาเป็นภาษาไทย
 */
function formatThaiTime(date) {
    return new Date(date).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok'
    });
}

/**
 * Format วันที่เป็นภาษาไทย
 */
function formatThaiDate(date) {
    return new Date(date).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Bangkok'
    });
}

/**
 * ตรวจสอบว่าควรส่ง alert หรือไม่ (cooldown)
 */
function shouldSendAlert(alertType) {
    const lastSent = lastAlerts[alertType];
    if (!lastSent) return true;
    
    const cooldown = ALERT_COOLDOWN[alertType] || 10 * 60 * 1000;
    const elapsed = Date.now() - lastSent;
    return elapsed >= cooldown;
}

/**
 * บันทึกเวลาที่ส่ง alert
 */
function markAlertSent(alertType) {
    lastAlerts[alertType] = Date.now();
}

// =====================================================
// WEATHER FORECAST
// =====================================================

/**
 * ดึงพยากรณ์อากาศรายชั่วโมงจาก Open-Meteo (ฟรี, ไม่ต้อง API key)
 */
export async function getHourlyForecast() {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${config.defaultLat}&longitude=${config.defaultLon}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code&timezone=Asia/Bangkok&forecast_days=1`;
        
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
            throw new Error(`Open-Meteo API error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('[EarlyWarning] Forecast fetch error:', error.message);
        throw error;
    }
}

/**
 * แปลง weather code เป็นคำอธิบาย
 */
function getWeatherDescription(code) {
    const weatherCodes = {
        0: 'ท้องฟ้าแจ่มใส',
        1: 'ค่อนข้างแจ่มใส',
        2: 'มีเมฆบางส่วน',
        3: 'มีเมฆมาก',
        45: 'มีหมอก',
        48: 'มีหมอกแข็ง',
        51: 'ฝนปรอยเบา',
        53: 'ฝนปรอยปานกลาง',
        55: 'ฝนปรอยหนัก',
        61: 'ฝนเบา',
        63: 'ฝนปานกลาง',
        65: 'ฝนหนัก',
        80: 'ฝนตกเป็นระยะเบา',
        81: 'ฝนตกเป็นระยะปานกลาง',
        82: 'ฝนตกเป็นระยะหนัก',
        95: 'พายุฝนฟ้าคะนอง',
        96: 'พายุฝนฟ้าคะนองมีลูกเห็บเบา',
        99: 'พายุฝนฟ้าคะนองมีลูกเห็บหนัก'
    };
    return weatherCodes[code] || 'ไม่ทราบสภาพอากาศ';
}

/**
 * ตรวจสอบว่า weather code เป็นฝนหรือไม่
 */
function isRainyWeatherCode(code) {
    const rainyCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
    return rainyCodes.includes(code);
}

/**
 * วิเคราะห์ว่าจะมีฝนภายใน X นาทีหรือไม่
 */
export async function checkRainForecast(minutesAhead = RAIN_FORECAST_MINUTES) {
    try {
        const forecast = await getHourlyForecast();
        const hourly = forecast.hourly;
        
        if (!hourly || !hourly.time) {
            return { hasRain: false, error: 'Invalid forecast data' };
        }
        
        const now = new Date();
        const checkUntil = new Date(now.getTime() + minutesAhead * 60 * 1000);
        
        // หาข้อมูลในช่วงเวลาที่ต้องการ
        const upcomingRain = [];
        
        for (let i = 0; i < hourly.time.length; i++) {
            const forecastTime = new Date(hourly.time[i]);
            
            // ข้ามถ้าเป็นอดีต
            if (forecastTime < now) continue;
            
            // หยุดถ้าเกินช่วงเวลาที่ต้องการ
            if (forecastTime > checkUntil) break;
            
            const precipProb = hourly.precipitation_probability[i] / 100; // แปลงเป็น 0-1
            const weatherCode = hourly.weather_code[i];
            const isRainy = isRainyWeatherCode(weatherCode) || precipProb >= RAIN_PROBABILITY_THRESHOLD;
            
            if (isRainy) {
                const minutesUntil = Math.round((forecastTime - now) / (60 * 1000));
                upcomingRain.push({
                    time: hourly.time[i],
                    minutes_until: minutesUntil,
                    probability: precipProb,
                    weather_code: weatherCode,
                    description: getWeatherDescription(weatherCode)
                });
            }
        }
        
        if (upcomingRain.length === 0) {
            return {
                hasRain: false,
                message: 'ไม่พบความเสี่ยงฝนตกใน 1 ชั่วโมงข้างหน้า'
            };
        }
        
        // หาฝนที่จะมาเร็วที่สุด
        const soonestRain = upcomingRain[0];
        
        return {
            hasRain: true,
            minutes_until: soonestRain.minutes_until,
            probability: soonestRain.probability,
            description: soonestRain.description,
            all_forecasts: upcomingRain,
            message: `คาดการณ์ฝนตกภายใน ~${soonestRain.minutes_until} นาที`
        };
    } catch (error) {
        console.error('[EarlyWarning] Rain check error:', error.message);
        return { hasRain: false, error: error.message };
    }
}

// =====================================================
// LINE MESSAGE TEMPLATES (ตาม PROMPT)
// =====================================================

/**
 * สร้างข้อความแจ้งเตือนฝน
 */
export function createRainWarningMessage(rainData) {
    const message = ` แจ้งเตือนสภาพอากาศ (คาดการณ์)

คาดการณ์ฝนตกภายใน ~${rainData.minutes_until} นาที ที่กาดกองต้า
โอกาสฝนตก: ${Math.round(rainData.probability * 100)}%
สภาพอากาศ: ${rainData.description}

คำแนะนำ:
• เตรียมร่ม/พิจารณาย้ายกิจกรรม
• แจ้งร้านค้าให้เตรียมพร้อม
• ระวังพื้นลื่น

(ข้อมูลจากระบบอัตโนมัติ)`;

    return message;
}

/**
 * สร้างข้อความแจ้งเตือนความแออัด (Warning: 1,201-2,500)
 */
export function createCrowdWarningMessage(crowdData) {
    const time = formatThaiTime(crowdData.timestamp);
    
    const message = `แจ้งเตือนความหนาแน่น — กาดกองต้า

สถานะ: ${crowdData.status_label} (ประมาณ ${crowdData.count.toLocaleString()} คน)
อัปเดตล่าสุด: ${time} น.

คำแนะนำ:
• โปรดพิจารณาเพิ่มเจ้าหน้าที่
• จัดช่องทางเดินให้ชัดเจน
• เตรียมพร้อมรับมือสถานการณ์

(ข้อมูลจากระบบอัตโนมัติ)`;

    return message;
}

/**
 * สร้างข้อความแจ้งเตือนความแออัด (Critical: >= 2,501)
 */
export function createCrowdCriticalMessage(crowdData) {
    const time = formatThaiTime(crowdData.timestamp);
    
    const message = ` ด่วน! พื้นที่หนาแน่นมาก — กาดกองต้า

สถานะ: ${crowdData.status_label} (ประมาณ ${crowdData.count.toLocaleString()} คน)
อัปเดตล่าสุด: ${time} น.

 คำแนะนำเร่งด่วน:
• แจ้งเจ้าหน้าที่ทันที
• พิจารณาจำกัดการเข้า-ออก
• เปิดช่องทางฉุกเฉิน
• เตรียมทีมพยาบาล

(ข้อมูลจากระบบอัตโนมัติ)`;

    return message;
}

/**
 * สร้างข้อความ Daily Report (ตาม PROMPT)
 */
export function createDailyReportMessage(reportData) {
    const dateStr = formatThaiDate(reportData.date);
    
    const message = `[สรุปประจำวัน] กาดกองต้า — ${dateStr}

จำนวนคนสูงสุด: ${(reportData.max_people || 0).toLocaleString()} คน
จำนวนคนเฉลี่ย: ${Math.round(reportData.avg_people || 0).toLocaleString()} คน
จำนวนตัวอย่าง: ${(reportData.total_samples || 0).toLocaleString()} ครั้ง

สภาพอากาศ: ${reportData.weather_summary || 'ไม่มีข้อมูล'}
อุณหภูมิ: ${reportData.temperature ? `${reportData.temperature}°C` : 'ไม่มีข้อมูล'}
PM2.5: ${reportData.pm25 ? `${reportData.pm25} μg/m³ (${reportData.pm25_status})` : 'ไม่มีข้อมูล'}

หมายเหตุ: ${reportData.notes || 'ไม่มีเหตุการณ์ฉุกเฉิน'}

(ข้อมูลจากระบบอัตโนมัติ)
Kad Kong Ta Smart Insight`;

    return message;
}

// =====================================================
// ALERT SENDING FUNCTIONS
// =====================================================

/**
 * ตั้งค่า LINE message sender
 */
export function setLineMessageSender(sender) {
    lineMessageSender = sender;
}

/**
 * ส่งข้อความไป LINE OA
 */
async function sendLineMessage(message) {
    if (!lineMessageSender) {
        console.warn('[EarlyWarning] LINE sender not configured');
        return { success: false, error: 'LINE sender not configured' };
    }
    
    try {
        const result = await lineMessageSender(message);
        return result;
    } catch (error) {
        console.error('[EarlyWarning] LINE send error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ส่งแจ้งเตือนฝน
 */
export async function sendRainWarning(rainData) {
    // ตรวจสอบวันที่เปิดทำการ
    if (!shouldSendAlertsToday()) {
        console.log('[EarlyWarning] Rain warning blocked - not weekend');
        return { success: false, reason: 'not_weekend' };
    }
    
    if (!shouldSendAlert('rain_warning')) {
        console.log('[EarlyWarning] Rain warning on cooldown');
        return { success: false, reason: 'cooldown' };
    }
    
    const message = createRainWarningMessage(rainData);
    const result = await sendLineMessage(message);
    
    if (result.success) {
        markAlertSent('rain_warning');
        console.log('[EarlyWarning] ✓ Rain warning sent');
    }
    
    return result;
}

/**
 * ส่งแจ้งเตือนความแออัด (Warning)
 */
export async function sendCrowdWarning(crowdData) {
    // ตรวจสอบวันที่เปิดทำการ
    if (!shouldSendAlertsToday()) {
        console.log('[EarlyWarning] Crowd warning blocked - not weekend');
        return { success: false, reason: 'not_weekend' };
    }
    
    if (!shouldSendAlert('crowd_warning')) {
        console.log('[EarlyWarning] Crowd warning on cooldown');
        return { success: false, reason: 'cooldown' };
    }
    
    const message = createCrowdWarningMessage(crowdData);
    const result = await sendLineMessage(message);
    
    if (result.success) {
        markAlertSent('crowd_warning');
        console.log('[EarlyWarning] ✓ Crowd warning sent');
    }
    
    return result;
}

/**
 * ส่งแจ้งเตือนความแออัด (Critical)
 */
export async function sendCrowdCritical(crowdData) {
    // ตรวจสอบวันที่เปิดทำการ
    if (!shouldSendAlertsToday()) {
        console.log('[EarlyWarning] Crowd critical blocked - not weekend');
        return { success: false, reason: 'not_weekend' };
    }
    
    if (!shouldSendAlert('crowd_critical')) {
        console.log('[EarlyWarning] Crowd critical on cooldown');
        return { success: false, reason: 'cooldown' };
    }
    
    const message = createCrowdCriticalMessage(crowdData);
    const result = await sendLineMessage(message);
    
    if (result.success) {
        markAlertSent('crowd_critical');
        console.log('[EarlyWarning] ✓ Crowd critical alert sent');
    }
    
    return result;
}

/**
 * ส่ง Daily Report
 */
export async function sendDailyReport(reportData) {
    const message = createDailyReportMessage(reportData);
    const result = await sendLineMessage(message);
    
    if (result.success) {
        console.log('[EarlyWarning]  Daily report sent');
    }
    
    return result;
}

// =====================================================
// SCHEDULED TASKS
// =====================================================

/**
 * ตรวจสอบพยากรณ์ฝนและส่งแจ้งเตือน (เรียกทุก 10 นาที)
 */
export async function processRainCheck() {
    // ตรวจสอบวันที่เปิดทำการก่อน
    if (!shouldSendAlertsToday()) {
        console.log('[EarlyWarning] Rain check skipped - not weekend');
        return { success: true, skipped: true, reason: 'not_weekend' };
    }
    
    console.log('[EarlyWarning] Checking rain forecast...');
    
    try {
        const rainData = await checkRainForecast(RAIN_FORECAST_MINUTES);
        
        if (rainData.hasRain) {
            console.log(`[EarlyWarning] Rain detected in ${rainData.minutes_until} minutes`);
            return await sendRainWarning(rainData);
        }
        
        console.log('[EarlyWarning] No rain risk detected');
        return { success: true, hasRain: false };
    } catch (error) {
        console.error('[EarlyWarning] Rain check error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ตรวจสอบความแออัดและส่งแจ้งเตือน (เรียกเมื่อมี ingest)
 */
export async function processCrowdCheck() {
    // ตรวจสอบวันที่เปิดทำการก่อน
    if (!shouldSendAlertsToday()) {
        console.log('[EarlyWarning] Crowd check skipped - not weekend');
        return { success: true, skipped: true, reason: 'not_weekend' };
    }
    
    const crowdLevel = peopleCountService.checkCrowdLevel();
    
    if (crowdLevel.is_critical) {
        return await sendCrowdCritical({
            count: crowdLevel.count,
            status_label: crowdLevel.label,
            timestamp: crowdLevel.timestamp || new Date().toISOString()
        });
    }
    
    if (crowdLevel.is_warning) {
        return await sendCrowdWarning({
            count: crowdLevel.count,
            status_label: crowdLevel.label,
            timestamp: crowdLevel.timestamp || new Date().toISOString()
        });
    }
    
    return { success: true, alert_sent: false };
}

/**
 * สร้างและส่ง Daily Report (เรียกทุกเสาร์-อาทิตย์ 23:00)
 */
export async function processDailyReport(date = null) {
    const reportDate = date || new Date().toISOString().split('T')[0];
    const checkDate = date ? new Date(date) : new Date();
    
    // ตรวจสอบว่าเป็นวันเสาร์-อาทิตย์หรือไม่
    if (!isWeekend(checkDate)) {
        const dayName = checkDate.toLocaleDateString('th-TH', { weekday: 'long', timeZone: 'Asia/Bangkok' });
        console.log(`[EarlyWarning] Daily report skipped for ${reportDate} (${dayName}) - not weekend`);
        return { success: false, reason: 'not_weekend', message: 'Daily reports are only sent on weekends' };
    }
    
    console.log(`[EarlyWarning] Generating daily report for ${reportDate} (weekend)`);
    
    try {
        // ดึงสรุปจำนวนคน
        const peopleSummary = await peopleCountService.getDailySummary(reportDate);
        
        // ดึงข้อมูลสภาพอากาศ (ถ้ามี)
        let weatherSummary = 'ไม่มีข้อมูล';
        let temperature = null;
        let pm25 = null;
        let pm25Status = 'ไม่มีข้อมูล';
        
        try {
            const forecast = await getHourlyForecast();
            if (forecast.hourly) {
                // หาข้อมูลเฉลี่ยของวัน
                const temps = forecast.hourly.temperature_2m || [];
                temperature = temps.length > 0 
                    ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length)
                    : null;
                
                // หา weather code ที่พบบ่อยที่สุด
                const codes = forecast.hourly.weather_code || [];
                if (codes.length > 0) {
                    const modeCode = codes.sort((a, b) =>
                        codes.filter(v => v === a).length - codes.filter(v => v === b).length
                    ).pop();
                    weatherSummary = getWeatherDescription(modeCode);
                }
            }
        } catch (e) {
            console.warn('[EarlyWarning] Weather fetch for report failed:', e.message);
        }
        
        const reportData = {
            date: reportDate,
            max_people: peopleSummary?.max_people || 0,
            avg_people: peopleSummary?.avg_people || 0,
            total_samples: peopleSummary?.total_samples || 0,
            weather_summary: weatherSummary,
            temperature,
            pm25,
            pm25_status: pm25Status,
            notes: 'ไม่มีเหตุการณ์ฉุกเฉิน'
        };
        
        return await sendDailyReport(reportData);
    } catch (error) {
        console.error('[EarlyWarning] Daily report error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ทดสอบส่งแจ้งเตือน (bypass cooldown)
 */
export async function testSendWarning(type = 'rain') {
    console.log(`[EarlyWarning] Test mode - sending ${type} warning`);
    
    // Reset cooldown สำหรับ test
    lastAlerts[`${type}_warning`] = null;
    
    if (type === 'rain') {
        const mockRainData = {
            minutes_until: 45,
            probability: 0.65,
            description: 'ฝนปานกลาง'
        };
        return await sendRainWarning(mockRainData);
    }
    
    if (type === 'crowd') {
        const mockCrowdData = {
            count: 1500,
            status_label: 'หนาแน่น',
            timestamp: new Date().toISOString()
        };
        return await sendCrowdWarning(mockCrowdData);
    }
    
    if (type === 'critical') {
        lastAlerts.crowd_critical = null;
        const mockCrowdData = {
            count: 2800,
            status_label: 'หนาแน่นมาก',
            timestamp: new Date().toISOString()
        };
        return await sendCrowdCritical(mockCrowdData);
    }
    
    if (type === 'daily') {
        return await processDailyReport();
    }
    
    return { success: false, error: 'Unknown test type' };
}

/**
 * ดึงสรุปพยากรณ์อากาศ (สำหรับ debug/API)
 */
export async function getForecastSummary() {
    try {
        const rainCheck = await checkRainForecast();
        const forecast = await getHourlyForecast();
        
        return {
            rain_check: rainCheck,
            raw_forecast: forecast,
            checked_at: new Date().toISOString()
        };
    } catch (error) {
        return { error: error.message };
    }
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

// =====================================================
// EXPORTS
// =====================================================

export const earlyWarningService = {
    // Configuration
    setLineMessageSender,
    
    // Weather
    isWeekend,
    getHourlyForecast,
    checkRainForecast,
    getForecastSummary,
    
    // Message Templates
    createRainWarningMessage,
    createCrowdWarningMessage,
    createCrowdCriticalMessage,
    createDailyReportMessage,
    
    // Alert Sending
    sendRainWarning,
    sendCrowdWarning,
    sendCrowdCritical,
    sendDailyReport,
    
    // Scheduled Tasks
    processRainCheck,
    processCrowdCheck,
    processDailyReport,
    
    // Testing
    testSendWarning,
    resetAlertCooldown,
    
    // Constants
    RAIN_FORECAST_MINUTES,
    RAIN_CHECK_INTERVAL_MS,
    ALERT_COOLDOWN
};

export default earlyWarningService;
