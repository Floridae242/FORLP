/* =====================================================
   Early Warning Service - ระบบแจ้งเตือนล่วงหน้า
   ส่งแจ้งเตือนทุกวันเสาร์-อาทิตย์ เวลา 14:00
   เมื่อมีความเสี่ยงฝนตกในช่วงเวลาตลาด (14:00 - 22:00)
   ===================================================== */

import { config } from '../config/index.js';
import { dailyReportService } from './dailyReportService.js';

// พิกัดลำปาง
const LAMPANG_LAT = 18.2888;
const LAMPANG_LON = 99.4907;

// ช่วงเวลาตลาด
const MARKET_START_HOUR = 14;
const MARKET_END_HOUR = 22;

/**
 * ตรวจสอบว่าเป็นวันเสาร์-อาทิตย์หรือไม่
 */
export function isWeekend(date = new Date()) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = อาทิตย์, 6 = เสาร์
}

/**
 * ดึงข้อมูลพยากรณ์อากาศรายชั่วโมงจาก Open-Meteo
 */
export async function getHourlyForecast() {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAMPANG_LAT}&longitude=${LAMPANG_LON}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code&timezone=Asia/Bangkok&forecast_days=1`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Open-Meteo API error: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
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
 * วิเคราะห์ความเสี่ยงฝนตกในช่วงเวลาตลาด (14:00 - 22:00)
 */
export async function analyzeMarketHoursRisk() {
    try {
        const forecast = await getHourlyForecast();
        const hourly = forecast.hourly;
        
        if (!hourly || !hourly.time) {
            throw new Error('Invalid forecast data');
        }
        
        // หาข้อมูลในช่วงเวลาตลาด (14:00 - 22:00)
        const marketHoursData = [];
        const today = new Date().toISOString().split('T')[0];
        
        for (let i = 0; i < hourly.time.length; i++) {
            const time = hourly.time[i];
            const hour = new Date(time).getHours();
            const date = time.split('T')[0];
            
            // เฉพาะวันนี้และช่วงเวลาตลาด
            if (date === today && hour >= MARKET_START_HOUR && hour <= MARKET_END_HOUR) {
                marketHoursData.push({
                    time: time,
                    hour: hour,
                    temperature: hourly.temperature_2m[i],
                    humidity: hourly.relative_humidity_2m[i],
                    precipitationProbability: hourly.precipitation_probability[i],
                    precipitation: hourly.precipitation[i],
                    weatherCode: hourly.weather_code[i],
                    weatherDescription: getWeatherDescription(hourly.weather_code[i])
                });
            }
        }
        
        if (marketHoursData.length === 0) {
            return {
                hasRisk: false,
                reason: 'No market hours data available'
            };
        }
        
        // หาชั่วโมงที่มีโอกาสฝนตกสูงสุด
        const maxRainProbability = Math.max(...marketHoursData.map(h => h.precipitationProbability));
        const avgRainProbability = Math.round(
            marketHoursData.reduce((sum, h) => sum + h.precipitationProbability, 0) / marketHoursData.length
        );
        
        // หาชั่วโมงที่มีความเสี่ยงสูง (โอกาสฝน > 40%)
        const riskyHours = marketHoursData.filter(h => h.precipitationProbability >= 40);
        
        // หาอุณหภูมิเฉลี่ย
        const avgTemperature = Math.round(
            marketHoursData.reduce((sum, h) => sum + h.temperature, 0) / marketHoursData.length
        );
        
        // พิจารณาว่ามีความเสี่ยงหรือไม่ (โอกาสฝน > 40% อย่างน้อย 1 ชั่วโมง)
        const hasRainRisk = maxRainProbability >= 40;
        
        return {
            hasRisk: hasRainRisk,
            maxRainProbability,
            avgRainProbability,
            avgTemperature,
            riskyHours,
            allHours: marketHoursData,
            assessedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('[EarlyWarning] Analysis error:', error.message);
        return {
            hasRisk: false,
            error: error.message,
            assessedAt: new Date().toISOString()
        };
    }
}

/**
 * สร้างข้อความแจ้งเตือน
 */
export function createWarningMessage(riskData) {
    if (!riskData.hasRisk) return null;
    
    // สร้างรายละเอียดชั่วโมงที่มีความเสี่ยง
    let riskyHoursDetail = '';
    if (riskData.riskyHours && riskData.riskyHours.length > 0) {
        riskyHoursDetail = riskData.riskyHours
            .map(h => `  • ${h.hour}.00 น. - โอกาสฝน ${h.precipitationProbability}% (${h.weatherDescription})`)
            .join('\n');
    }
    
    const message = `📢 แจ้งเตือนสภาพอากาศ (เบื้องต้น)
━━━━━━━━━━━━━━━

จากการประเมินข้อมูลพยากรณ์อากาศ
วันนี้มีความเสี่ยงฝนตกในพื้นที่กาดกองต้า (โอกาส ${riskData.maxRainProbability}%)

🌡 อุณหภูมิเฉลี่ย: ${riskData.avgTemperature}°C
🌧 โอกาสฝนเฉลี่ย: ${riskData.avgRainProbability}%

⏰ ช่วงเวลาที่ควรระวัง:
${riskyHoursDetail}

💡 ขอแนะนำให้ผู้ใช้งานพื้นที่
เตรียมอุปกรณ์กันฝน และใช้ความระมัดระวังในการเดินพื้นที่

━━━━━━━━━━━━━━━
ข้อมูลนี้เป็นการประเมินจากระบบอัตโนมัติ
ใช้เพื่อการเตรียมความพร้อมเบื้องต้น
🐓 Kad Kong Ta Smart Insight`;

    return message;
}

/**
 * ส่งแจ้งเตือนไป LINE OA
 */
export async function sendWarning(riskData) {
    const message = createWarningMessage(riskData);
    
    if (!message) {
        console.log('[EarlyWarning] No warning needed');
        return { success: true, sent: false, reason: 'No risk detected' };
    }
    
    const result = await dailyReportService.sendLineMessage(message);
    
    return {
        success: result.success,
        sent: result.success,
        message: message,
        error: result.error || null
    };
}

/**
 * ประมวลผลและส่งแจ้งเตือน (เรียกจาก scheduler)
 * เรียกทุกวันเสาร์-อาทิตย์ เวลา 14:00
 */
export async function processEarlyWarning() {
    console.log('[EarlyWarning] Processing...');
    
    // ตรวจสอบว่าเป็นวันเสาร์-อาทิตย์
    if (!isWeekend()) {
        console.log('[EarlyWarning] Not weekend - skipping');
        return { success: true, skipped: true, reason: 'Not weekend' };
    }
    
    // วิเคราะห์ความเสี่ยงในช่วงเวลาตลาด
    const riskData = await analyzeMarketHoursRisk();
    
    if (!riskData.hasRisk) {
        console.log('[EarlyWarning] No rain risk detected');
        return { success: true, sent: false, reason: 'No risk', data: riskData };
    }
    
    console.log(`[EarlyWarning] Rain risk detected: ${riskData.maxRainProbability}%`);
    
    // ส่งแจ้งเตือน
    const result = await sendWarning(riskData);
    
    console.log(`[EarlyWarning] Result: ${result.sent ? 'Sent' : 'Not sent'}`);
    
    return result;
}

/**
 * ทดสอบส่งแจ้งเตือน (bypass weekend check)
 */
export async function testSendWarning() {
    console.log('[EarlyWarning] Test mode - analyzing forecast...');
    
    const riskData = await analyzeMarketHoursRisk();
    
    console.log('[EarlyWarning] Risk data:', JSON.stringify(riskData, null, 2));
    
    // ถ้าไม่มีความเสี่ยง ให้ mock data สำหรับทดสอบ
    if (!riskData.hasRisk) {
        console.log('[EarlyWarning] No risk - using mock data for test');
        riskData.hasRisk = true;
        riskData.maxRainProbability = 65;
        riskData.avgRainProbability = 45;
        riskData.avgTemperature = 28;
        riskData.riskyHours = [
            { hour: 17, precipitationProbability: 55, weatherDescription: 'ฝนตกเป็นระยะเบา' },
            { hour: 18, precipitationProbability: 65, weatherDescription: 'ฝนปานกลาง' },
            { hour: 19, precipitationProbability: 50, weatherDescription: 'ฝนตกเป็นระยะเบา' }
        ];
    }
    
    return await sendWarning(riskData);
}

/**
 * ดูข้อมูลพยากรณ์อากาศ (สำหรับ debug)
 */
export async function getForecastSummary() {
    const riskData = await analyzeMarketHoursRisk();
    return {
        ...riskData,
        message: createWarningMessage(riskData)
    };
}

export const earlyWarningService = {
    isWeekend,
    getHourlyForecast,
    analyzeMarketHoursRisk,
    createWarningMessage,
    sendWarning,
    processEarlyWarning,
    testSendWarning,
    getForecastSummary
};

export default earlyWarningService;
