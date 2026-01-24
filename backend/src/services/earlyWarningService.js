// =====================================================
// Kad Kong Ta Smart Insight - Early Warning Service
// ระบบแจ้งเตือนความเสี่ยงสภาพอากาศ & PM2.5
// ส่ง LINE OA เฉพาะวันเสาร์-อาทิตย์ เวลา 14:00 น.
// ใช้ Open-Meteo API สำหรับพยากรณ์อากาศล่วงหน้า
// =====================================================

import { config } from '../config/index.js';
import { weatherService } from './weatherService.js';

// =====================================================
// Configuration - เกณฑ์การแจ้งเตือน
// =====================================================

const WARNING_CONFIG = {
    // PM2.5 threshold (µg/m³) - เริ่มมีผลกระทบต่อสุขภาพ
    pm25: {
        cautionLevel: 50,      // ระดับเฝ้าระวัง
        warningLevel: 90       // ระดับมีผลต่อสุขภาพ
    },
    // เกณฑ์โอกาสฝนตก (%)
    rain: {
        probabilityThreshold: 40,  // โอกาสฝนตก >= 40% ถือว่ามีความเสี่ยง
        precipitationThreshold: 1  // ปริมาณฝนสะสม >= 1 mm ถือว่ามีความเสี่ยง
    }
};

// =====================================================
// Risk Assessment Functions
// =====================================================

/**
 * ประเมินความเสี่ยงฝนตก (ใช้ Open-Meteo Forecast)
 * @param {Object} forecastData - ข้อมูลพยากรณ์จาก Open-Meteo
 * @param {Object} currentWeatherData - ข้อมูลสภาพอากาศปัจจุบันจาก OpenWeatherMap
 * @returns {Object} { hasRisk: boolean, details: string, probability: number }
 */
function assessRainRisk(forecastData, currentWeatherData) {
    // ตรวจสอบจากพยากรณ์ล่วงหน้า (Open-Meteo) เป็นหลัก
    if (forecastData) {
        const today = forecastData.today;
        const marketHours = forecastData.marketHours;
        
        // ตรวจสอบช่วงเวลาตลาด (14:00 - 22:00)
        if (marketHours?.summary) {
            const { hasRainRisk, maxPrecipitationProbability, totalPrecipitation, hoursWithRainRisk } = marketHours.summary;
            
            if (hasRainRisk || maxPrecipitationProbability >= WARNING_CONFIG.rain.probabilityThreshold) {
                return {
                    hasRisk: true,
                    probability: maxPrecipitationProbability,
                    precipitationSum: totalPrecipitation,
                    hoursAtRisk: hoursWithRainRisk,
                    weatherDescription: today?.weatherDescription || 'มีโอกาสฝนตก',
                    details: `พยากรณ์: ${today?.weatherDescription || 'มีโอกาสฝนตก'} (โอกาส ${maxPrecipitationProbability}%${totalPrecipitation > 0 ? `, ฝนสะสม ${totalPrecipitation} mm` : ''})`,
                    source: 'open-meteo'
                };
            }
        }
        
        // ตรวจสอบพยากรณ์ทั้งวัน
        if (today) {
            const isRainy = today.isRainy;
            const probability = today.precipitation_probability_max || 0;
            const precipSum = today.precipitation_sum || 0;
            
            if (isRainy || probability >= WARNING_CONFIG.rain.probabilityThreshold || precipSum >= WARNING_CONFIG.rain.precipitationThreshold) {
                return {
                    hasRisk: true,
                    probability: probability,
                    precipitationSum: precipSum,
                    weatherDescription: today.weatherDescription,
                    details: `พยากรณ์วันนี้: ${today.weatherDescription} (โอกาส ${probability}%${precipSum > 0 ? `, ฝนสะสม ${precipSum} mm` : ''})`,
                    source: 'open-meteo'
                };
            }
        }
    }
    
    // Fallback: ตรวจสอบจากสภาพอากาศปัจจุบัน (OpenWeatherMap)
    if (currentWeatherData) {
        const weatherId = currentWeatherData.weather?.id;
        const weatherMain = currentWeatherData.weather?.main?.toLowerCase() || '';
        const weatherDesc = currentWeatherData.weather?.description || '';
        const rainAmount = currentWeatherData.rain?.['1h'] || currentWeatherData.rain?.['3h'] || 0;

        // Weather IDs ที่เกี่ยวกับฝน (200-599)
        const hasRainById = weatherId >= 200 && weatherId <= 599;
        const hasRainByCondition = ['rain', 'drizzle', 'thunderstorm', 'shower'].some(
            condition => weatherMain.includes(condition)
        );
        const hasRainAmount = rainAmount > 0;

        if (hasRainById || hasRainByCondition || hasRainAmount) {
            return {
                hasRisk: true,
                probability: null,
                precipitationSum: rainAmount,
                weatherDescription: weatherDesc,
                details: `สภาพอากาศปัจจุบัน: ${weatherDesc}${rainAmount > 0 ? ` (ฝน ${rainAmount} mm)` : ''}`,
                source: 'openweathermap'
            };
        }
    }

    return { 
        hasRisk: false, 
        probability: forecastData?.today?.precipitation_probability_max || 0,
        details: 'ไม่พบความเสี่ยงฝนตก',
        source: forecastData ? 'open-meteo' : 'none'
    };
}

/**
 * ประเมินความเสี่ยง PM2.5
 * @param {Object} airQualityData - ข้อมูลคุณภาพอากาศจาก API
 * @returns {Object} { hasRisk: boolean, level: string, value: number, details: string }
 */
function assessPM25Risk(airQualityData) {
    if (!airQualityData) {
        return { hasRisk: false, level: 'unknown', value: null, details: 'ไม่มีข้อมูลคุณภาพอากาศ' };
    }

    const pm25Value = airQualityData.components?.pm2_5?.value;
    
    if (pm25Value === null || pm25Value === undefined) {
        return { hasRisk: false, level: 'unknown', value: null, details: 'ไม่มีข้อมูล PM2.5' };
    }

    const roundedValue = Math.round(pm25Value);

    if (pm25Value >= WARNING_CONFIG.pm25.warningLevel) {
        return {
            hasRisk: true,
            level: 'warning',
            value: roundedValue,
            details: `PM2.5: ${roundedValue} µg/m³ (มีผลต่อสุขภาพ)`
        };
    }
    
    if (pm25Value >= WARNING_CONFIG.pm25.cautionLevel) {
        return {
            hasRisk: true,
            level: 'caution',
            value: roundedValue,
            details: `PM2.5: ${roundedValue} µg/m³ (เริ่มมีผลต่อสุขภาพ)`
        };
    }

    return {
        hasRisk: false,
        level: 'good',
        value: roundedValue,
        details: `PM2.5: ${roundedValue} µg/m³ (ปกติ)`
    };
}

// =====================================================
// Message Generation Functions
// =====================================================

/**
 * สร้างข้อความแจ้งเตือนฝนตก (พร้อมข้อมูลพยากรณ์)
 */
function createRainWarningMessage(rainRisk) {
    const probabilityText = rainRisk.probability ? ` (โอกาส ${rainRisk.probability}%)` : '';
    
    return `📢 แจ้งเตือนสภาพอากาศ (เบื้องต้น)

จากการประเมินข้อมูลพยากรณ์อากาศ
วันนี้มีความเสี่ยงฝนตกในพื้นที่กาดก้องตา${probabilityText}

ขอแนะนำให้ผู้ใช้งานพื้นที่
เตรียมอุปกรณ์กันฝน และใช้ความระมัดระวังในการเดินพื้นที่

━━━━━━━━━━━━━━━
ข้อมูลนี้เป็นการประเมินจากระบบอัตโนมัติ
ใช้เพื่อการเตรียมความพร้อมเบื้องต้น
🏮 Kad Kong Ta Smart Insight`;
}

/**
 * สร้างข้อความแจ้งเตือน PM2.5 สูง
 */
function createPM25WarningMessage(pm25Value) {
    return `📢 แจ้งเตือนคุณภาพอากาศ (เบื้องต้น)

จากข้อมูลคุณภาพอากาศในพื้นที่
พบว่าค่า PM2.5 อยู่ในระดับที่เริ่มมีผลกระทบต่อสุขภาพ
(${pm25Value} µg/m³)

ขอแนะนำให้ผู้ใช้งานพื้นที่
สวมใส่หน้ากากอนามัย (Mask) เพื่อความปลอดภัยเบื้องต้น

━━━━━━━━━━━━━━━
ข้อมูลนี้เป็นการประเมินจากระบบอัตโนมัติ
ใช้เพื่อการเตรียมความพร้อมเบื้องต้น
🏮 Kad Kong Ta Smart Insight`;
}

/**
 * สร้างข้อความแจ้งเตือนรวม (ฝน + PM2.5)
 */
function createCombinedWarningMessage(rainRisk, pm25Value) {
    const probabilityText = rainRisk.probability ? ` (โอกาส ${rainRisk.probability}%)` : '';
    
    return `📢 แจ้งเตือนสภาพแวดล้อม (เบื้องต้น)

จากการประเมินข้อมูลพยากรณ์อากาศและคุณภาพอากาศ
วันนี้มีความเสี่ยงฝนตก${probabilityText} และค่า PM2.5 อยู่ในระดับเฝ้าระวัง
(${pm25Value} µg/m³)

ขอแนะนำให้ผู้ใช้งานพื้นที่
เตรียมอุปกรณ์กันฝน และสวมใส่หน้ากากอนามัย
เพื่อความปลอดภัยเบื้องต้น

━━━━━━━━━━━━━━━
ข้อมูลนี้เป็นการประเมินจากระบบอัตโนมัติ
ใช้เพื่อการเตรียมความพร้อมเบื้องต้น
🏮 Kad Kong Ta Smart Insight`;
}

// =====================================================
// Main Service Functions
// =====================================================

/**
 * ตรวจสอบความเสี่ยงทั้งหมดจาก API
 * @returns {Object} ผลการประเมินความเสี่ยง
 */
export async function assessAllRisks() {
    console.log('[EarlyWarning] Assessing risks...');
    
    try {
        // ดึงข้อมูลจาก API (รวม Open-Meteo สำหรับพยากรณ์ล่วงหน้า)
        const [weatherResult, airQualityResult, forecastResult] = await Promise.all([
            weatherService.getCurrentWeather(),
            weatherService.getAirQuality(),
            weatherService.getOpenMeteoForecast()
        ]);

        // ประเมินความเสี่ยงฝนตก (ใช้ Open-Meteo เป็นหลัก)
        const rainRisk = assessRainRisk(forecastResult.data, weatherResult.data);
        
        // ประเมินความเสี่ยง PM2.5
        const pm25Risk = assessPM25Risk(airQualityResult.data);

        const assessment = {
            timestamp: new Date().toISOString(),
            rain: rainRisk,
            pm25: pm25Risk,
            hasAnyRisk: rainRisk.hasRisk || pm25Risk.hasRisk,
            rawData: {
                weather: weatherResult.success ? weatherResult.data : null,
                airQuality: airQualityResult.success ? airQualityResult.data : null,
                forecast: forecastResult.success ? forecastResult.data : null
            },
            dataSources: {
                weather: weatherResult.success ? 'openweathermap' : 'unavailable',
                airQuality: airQualityResult.success ? 'openweathermap' : 'unavailable',
                forecast: forecastResult.success ? 'open-meteo' : 'unavailable'
            }
        };

        console.log(`[EarlyWarning] Assessment complete - Rain: ${rainRisk.hasRisk} (${rainRisk.probability || 0}%), PM2.5: ${pm25Risk.hasRisk}`);
        
        return assessment;
    } catch (error) {
        console.error('[EarlyWarning] Assessment error:', error.message);
        return {
            timestamp: new Date().toISOString(),
            rain: { hasRisk: false, details: 'Error fetching data' },
            pm25: { hasRisk: false, level: 'unknown', value: null, details: 'Error fetching data' },
            hasAnyRisk: false,
            error: error.message
        };
    }
}

/**
 * สร้างข้อความแจ้งเตือนตามผลประเมิน
 * @param {Object} assessment - ผลการประเมินความเสี่ยง
 * @returns {string|null} ข้อความแจ้งเตือน หรือ null ถ้าไม่มีความเสี่ยง
 */
export function generateWarningMessage(assessment) {
    if (!assessment.hasAnyRisk) {
        return null;
    }

    const hasRain = assessment.rain.hasRisk;
    const hasPM25 = assessment.pm25.hasRisk;
    const pm25Value = assessment.pm25.value;

    // ทั้งฝนและ PM2.5
    if (hasRain && hasPM25) {
        return createCombinedWarningMessage(assessment.rain, pm25Value);
    }

    // เฉพาะฝน
    if (hasRain) {
        return createRainWarningMessage(assessment.rain);
    }

    // เฉพาะ PM2.5
    if (hasPM25) {
        return createPM25WarningMessage(pm25Value);
    }

    return null;
}

/**
 * ส่งข้อความแจ้งเตือนไป LINE OA
 */
export async function sendWarningToLine(message) {
    if (!config.lineChannelAccessToken) {
        console.warn('[EarlyWarning] LINE not configured - skipping notification');
        return { 
            success: false, 
            error: 'LINE not configured',
            message: 'LINE_CHANNEL_ACCESS_TOKEN ไม่ได้ตั้งค่า'
        };
    }

    try {
        console.log('[EarlyWarning] Sending warning to LINE...');
        
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

        console.log('[EarlyWarning] Warning sent successfully');
        return { success: true };
    } catch (error) {
        console.error('[EarlyWarning] LINE Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ตรวจสอบว่าเป็นวันเสาร์หรืออาทิตย์หรือไม่ (เวลาประเทศไทย)
 */
export function isMarketDay(date = new Date()) {
    const thaiTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const day = thaiTime.getDay();
    return day === 0 || day === 6;
}

/**
 * ตรวจสอบว่าถึงเวลาแจ้งเตือนหรือยัง (14:00 น. เวลาประเทศไทย)
 */
export function isAlertTime(date = new Date()) {
    const thaiTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const hour = thaiTime.getHours();
    const minute = thaiTime.getMinutes();
    return hour === 14 && minute >= 0 && minute < 5;
}

/**
 * Process หลัก - ตรวจสอบและส่งแจ้งเตือน
 */
export async function processEarlyWarning(force = false) {
    const now = new Date();
    const thaiTimeStr = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    console.log(`[EarlyWarning] Processing at ${thaiTimeStr}`);

    if (!force && !isMarketDay(now)) {
        console.log('[EarlyWarning] Not a market day (Sat/Sun) - skipping');
        return {
            success: true,
            action: 'skipped',
            reason: 'ไม่ใช่วันเปิดตลาด (เสาร์/อาทิตย์)'
        };
    }

    const assessment = await assessAllRisks();

    if (!assessment.hasAnyRisk) {
        console.log('[EarlyWarning] No risks detected - no alert needed');
        return {
            success: true,
            action: 'no_alert',
            reason: 'ไม่พบความเสี่ยง',
            assessment
        };
    }

    const message = generateWarningMessage(assessment);
    
    if (!message) {
        return {
            success: true,
            action: 'no_message',
            reason: 'ไม่สามารถสร้างข้อความได้',
            assessment
        };
    }

    const lineResult = await sendWarningToLine(message);

    return {
        success: lineResult.success,
        action: lineResult.success ? 'sent' : 'failed',
        assessment,
        message: lineResult.success ? message : null,
        error: lineResult.error || null,
        timestamp: new Date().toISOString()
    };
}

/**
 * ดึงสถานะระบบ Early Warning
 */
export function getEarlyWarningStatus() {
    const now = new Date();
    const thaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    
    return {
        currentTime: thaiTime.toLocaleTimeString('th-TH'),
        currentDay: dayNames[thaiTime.getDay()],
        isMarketDay: isMarketDay(now),
        alertTime: '14:00 น.',
        thresholds: {
            pm25_caution: WARNING_CONFIG.pm25.cautionLevel,
            pm25_warning: WARNING_CONFIG.pm25.warningLevel,
            rain_probability: WARNING_CONFIG.rain.probabilityThreshold
        },
        dataSources: {
            weather: 'OpenWeatherMap',
            airQuality: 'OpenWeatherMap',
            forecast: 'Open-Meteo (พยากรณ์ล่วงหน้า)'
        },
        lineConfigured: !!config.lineChannelAccessToken
    };
}

/**
 * หาเวลาแจ้งเตือนถัดไป (วันเสาร์หรืออาทิตย์ 14:00 น.)
 */
export function getNextAlertTime() {
    const now = new Date();
    const thaiOffset = 7 * 60 * 60 * 1000;
    
    let targetDate = new Date(now);
    targetDate.setUTCHours(14 - 7, 0, 0, 0);
    
    const thaiNow = new Date(now.getTime() + thaiOffset);
    if (isMarketDay(now) && thaiNow.getHours() < 14) {
        return targetDate;
    }
    
    targetDate.setDate(targetDate.getDate() + 1);
    while (!isMarketDay(targetDate)) {
        targetDate.setDate(targetDate.getDate() + 1);
    }
    
    targetDate.setUTCHours(14 - 7, 0, 0, 0);
    
    return targetDate;
}

export const earlyWarningService = {
    assessAllRisks,
    generateWarningMessage,
    sendWarningToLine,
    processEarlyWarning,
    getEarlyWarningStatus,
    getNextAlertTime,
    isMarketDay,
    isAlertTime
};

export default earlyWarningService;
