/* =====================================================
   Early Warning Service - ระบบแจ้งเตือนล่วงหน้า
   ส่งแจ้งเตือนทุกวันเสาร์-อาทิตย์ เวลา 14:00
   เมื่อมีความเสี่ยงฝนตก หรือ PM2.5 สูง
   ===================================================== */

import { config } from '../config/index.js';
import { weatherService } from './weatherService.js';
import { dailyReportService } from './dailyReportService.js';

/**
 * ตรวจสอบว่าเป็นวันเสาร์-อาทิตย์หรือไม่
 */
export function isWeekend(date = new Date()) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = อาทิตย์, 6 = เสาร์
}

/**
 * ประเมินความเสี่ยงสภาพอากาศ
 */
export async function assessWeatherRisk() {
    try {
        const [weather, airQuality] = await Promise.all([
            weatherService.getCurrentWeather(),
            weatherService.getAirQuality()
        ]);
        
        const pm25 = airQuality.data?.components?.pm2_5?.value || null;
        const rainProbability = weather.data?.rain?.probability || 0;
        const weatherDesc = (weather.data?.weather?.description || '').toLowerCase();
        const temperature = weather.data?.temperature?.current || null;
        const humidity = weather.data?.humidity || null;
        
        // ตรวจสอบความเสี่ยงฝนตก
        const rainRisk = rainProbability > 50 || 
                         weatherDesc.includes('rain') || 
                         weatherDesc.includes('ฝน') ||
                         weatherDesc.includes('พายุ') ||
                         weatherDesc.includes('storm');
        
        // ตรวจสอบความเสี่ยง PM2.5 (มาตรฐาน WHO: 25 µg/m³, ไทย: 50 µg/m³)
        const pm25Risk = pm25 !== null && pm25 > 50;
        const pm25Warning = pm25 !== null && pm25 > 37; // เริ่มเตือนที่ 37
        
        return {
            hasRisk: rainRisk || pm25Risk,
            rainRisk,
            pm25Risk,
            pm25Warning,
            pm25,
            temperature,
            humidity,
            weatherDescription: weather.data?.weather?.description || 'ไม่มีข้อมูล',
            assessedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('[EarlyWarning] Assessment Error:', error.message);
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
    
    const warnings = [];
    const recommendations = [];
    
    if (riskData.rainRisk) {
        warnings.push('🌧 คาดว่าจะมีฝนตก');
        recommendations.push('• เตรียมอุปกรณ์กันฝน');
        recommendations.push('• ระวังพื้นลื่น');
    }
    
    if (riskData.pm25Risk) {
        warnings.push(`🌫 PM2.5 สูงกว่ามาตรฐาน (${riskData.pm25} µg/m³)`);
        recommendations.push('• สวมหน้ากากอนามัย');
        recommendations.push('• หลีกเลี่ยงกิจกรรมกลางแจ้งเป็นเวลานาน');
        recommendations.push('• ผู้สูงอายุและเด็กควรอยู่ในอาคาร');
    } else if (riskData.pm25Warning) {
        warnings.push(`⚠️ PM2.5 เริ่มสูง (${riskData.pm25} µg/m³)`);
        recommendations.push('• ควรสวมหน้ากากอนามัย');
    }
    
    const message = `⚠️ แจ้งเตือนสภาพอากาศวันนี้
━━━━━━━━━━━━━━━

${warnings.join('\n')}

🌡 อุณหภูมิ: ${riskData.temperature ? `${riskData.temperature}°C` : 'ไม่มีข้อมูล'}
💧 ความชื้น: ${riskData.humidity ? `${riskData.humidity}%` : 'ไม่มีข้อมูล'}

💡 คำแนะนำ:
${recommendations.join('\n')}

━━━━━━━━━━━━━━━
📍 ถนนคนเดินกาดกองต้า
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
    
    // ประเมินความเสี่ยง
    const riskData = await assessWeatherRisk();
    
    if (!riskData.hasRisk) {
        console.log('[EarlyWarning] No risks detected');
        return { success: true, sent: false, reason: 'No risk' };
    }
    
    // ส่งแจ้งเตือน
    const result = await sendWarning(riskData);
    
    console.log(`[EarlyWarning] Result: ${result.success ? 'Sent' : 'Failed'}`);
    
    return result;
}

/**
 * ทดสอบส่งแจ้งเตือน (bypass weekend check)
 */
export async function testSendWarning() {
    const riskData = await assessWeatherRisk();
    
    // Force send for testing
    if (!riskData.hasRisk) {
        riskData.hasRisk = true;
        riskData.pm25Warning = true;
        riskData.pm25 = 40;
    }
    
    return await sendWarning(riskData);
}

export const earlyWarningService = {
    isWeekend,
    assessWeatherRisk,
    createWarningMessage,
    sendWarning,
    processEarlyWarning,
    testSendWarning
};

export default earlyWarningService;
