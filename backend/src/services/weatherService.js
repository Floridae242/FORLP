// filepath: /Users/floridae/Desktop/FORLP/backend/src/services/weatherService.js
/**
 * Weather API Service
 * เชื่อมต่อกับ:
 * - OpenWeatherMap: สภาพอากาศปัจจุบัน, Air Quality (PM2.5, AQI)
 * - Open-Meteo: พยากรณ์อากาศล่วงหน้า (ฟรี ไม่ต้องใช้ API Key)
 */

import { config } from '../config/index.js';

// =====================================================
// Kad Kong Ta Smart Insight - Weather Service
// =====================================================

const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';
const OPENMETEO_BASE_URL = 'https://api.open-meteo.com/v1';
const API_KEY = process.env.OPENWEATHER_API_KEY || '2e840e910703cfed79919cef0a09f771';

// Default location: กาดก้องตา ลำปาง
const DEFAULT_LAT = parseFloat(process.env.DEFAULT_LAT) || 18.2816;
const DEFAULT_LON = parseFloat(process.env.DEFAULT_LON) || 99.5082;

// =====================================================
// Open-Meteo API (พยากรณ์อากาศล่วงหน้า - ฟรี)
// =====================================================

/**
 * ดึงพยากรณ์อากาศล่วงหน้าจาก Open-Meteo (ฟรี ไม่ต้องใช้ API Key)
 * เหมาะสำหรับ Early Warning System
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Object} ข้อมูลพยากรณ์อากาศ
 */
export async function getOpenMeteoForecast(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
    try {
        // ดึงข้อมูลพยากรณ์รายชั่วโมง รวมถึง precipitation probability และ weather code
        const url = `${OPENMETEO_BASE_URL}/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,precipitation_probability,precipitation,weathercode,windspeed_10m&daily=weathercode,precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=Asia%2FBangkok&forecast_days=2`;
        
        console.log('[Weather] Fetching Open-Meteo forecast...');
        
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            throw new Error(`Open-Meteo API Error: ${response.status}`);
        }

        const data = await response.json();
        
        return {
            success: true,
            data: normalizeOpenMeteoData(data),
            source: 'open-meteo',
            fetchedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('[Weather] Failed to fetch Open-Meteo forecast:', error.message);
        return {
            success: false,
            error: error.message,
            data: null,
            source: 'open-meteo'
        };
    }
}

/**
 * Normalize Open-Meteo data
 */
function normalizeOpenMeteoData(data) {
    if (!data) return null;

    const current = data.current_weather || {};
    const hourly = data.hourly || {};
    const daily = data.daily || {};
    
    // แปลง Weather Code เป็นคำอธิบาย
    const weatherDescription = getWeatherCodeDescription(current.weathercode);
    
    // หาช่วงเวลาตลาด (14:00 - 22:00 วันนี้)
    const todayMarketHours = extractMarketHoursForecast(hourly);
    
    return {
        current: {
            temperature: current.temperature,
            windspeed: current.windspeed,
            winddirection: current.winddirection,
            weathercode: current.weathercode,
            weatherDescription: weatherDescription,
            isRaining: isRainyWeatherCode(current.weathercode),
            time: current.time
        },
        // พยากรณ์วันนี้
        today: {
            date: daily.time?.[0],
            weathercode: daily.weathercode?.[0],
            weatherDescription: getWeatherCodeDescription(daily.weathercode?.[0]),
            isRainy: isRainyWeatherCode(daily.weathercode?.[0]),
            precipitation_sum: daily.precipitation_sum?.[0], // mm
            precipitation_probability_max: daily.precipitation_probability_max?.[0], // %
            temperature_max: daily.temperature_2m_max?.[0],
            temperature_min: daily.temperature_2m_min?.[0]
        },
        // พยากรณ์พรุ่งนี้
        tomorrow: {
            date: daily.time?.[1],
            weathercode: daily.weathercode?.[1],
            weatherDescription: getWeatherCodeDescription(daily.weathercode?.[1]),
            isRainy: isRainyWeatherCode(daily.weathercode?.[1]),
            precipitation_sum: daily.precipitation_sum?.[1],
            precipitation_probability_max: daily.precipitation_probability_max?.[1],
            temperature_max: daily.temperature_2m_max?.[1],
            temperature_min: daily.temperature_2m_min?.[1]
        },
        // พยากรณ์ช่วงเวลาตลาด (14:00 - 22:00)
        marketHours: todayMarketHours,
        // ข้อมูลดิบรายชั่วโมง (24 ชั่วโมงแรก)
        hourlyForecast: extractHourlyForecast(hourly, 24)
    };
}

/**
 * ดึงพยากรณ์ช่วงเวลาตลาด (14:00 - 22:00)
 */
function extractMarketHoursForecast(hourly) {
    if (!hourly?.time) return null;
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const marketHours = [];
    let hasRainRisk = false;
    let maxPrecipitationProb = 0;
    let totalPrecipitation = 0;
    
    for (let i = 0; i < hourly.time.length; i++) {
        const time = hourly.time[i];
        const hour = new Date(time).getHours();
        
        // เฉพาะวันนี้ ช่วง 14:00 - 22:00
        if (time.startsWith(todayStr) && hour >= 14 && hour <= 22) {
            const precipProb = hourly.precipitation_probability?.[i] || 0;
            const precip = hourly.precipitation?.[i] || 0;
            const weathercode = hourly.weathercode?.[i];
            
            marketHours.push({
                time: time,
                hour: hour,
                temperature: hourly.temperature_2m?.[i],
                humidity: hourly.relativehumidity_2m?.[i],
                precipitation_probability: precipProb,
                precipitation: precip,
                weathercode: weathercode,
                weatherDescription: getWeatherCodeDescription(weathercode),
                isRainy: isRainyWeatherCode(weathercode)
            });
            
            if (precipProb > maxPrecipitationProb) {
                maxPrecipitationProb = precipProb;
            }
            totalPrecipitation += precip;
            
            if (isRainyWeatherCode(weathercode) || precipProb >= 50) {
                hasRainRisk = true;
            }
        }
    }
    
    return {
        hours: marketHours,
        summary: {
            hasRainRisk,
            maxPrecipitationProbability: maxPrecipitationProb,
            totalPrecipitation: Math.round(totalPrecipitation * 10) / 10,
            hoursWithRainRisk: marketHours.filter(h => h.isRainy || h.precipitation_probability >= 50).length
        }
    };
}

/**
 * ดึงพยากรณ์รายชั่วโมง
 */
function extractHourlyForecast(hourly, hours = 24) {
    if (!hourly?.time) return [];
    
    const forecast = [];
    const limit = Math.min(hours, hourly.time.length);
    
    for (let i = 0; i < limit; i++) {
        forecast.push({
            time: hourly.time[i],
            temperature: hourly.temperature_2m?.[i],
            humidity: hourly.relativehumidity_2m?.[i],
            precipitation_probability: hourly.precipitation_probability?.[i],
            precipitation: hourly.precipitation?.[i],
            weathercode: hourly.weathercode?.[i],
            weatherDescription: getWeatherCodeDescription(hourly.weathercode?.[i]),
            windspeed: hourly.windspeed_10m?.[i]
        });
    }
    
    return forecast;
}

/**
 * แปลง WMO Weather Code เป็นคำอธิบายภาษาไทย
 * https://open-meteo.com/en/docs#weathervariables
 */
function getWeatherCodeDescription(code) {
    const weatherCodes = {
        0: 'ท้องฟ้าแจ่มใส',
        1: 'ท้องฟ้าโปร่ง',
        2: 'มีเมฆบางส่วน',
        3: 'มีเมฆมาก',
        45: 'หมอก',
        48: 'หมอกแข็ง',
        51: 'ฝนละอองเบา',
        53: 'ฝนละอองปานกลาง',
        55: 'ฝนละอองหนัก',
        56: 'ฝนละอองเยือกแข็งเบา',
        57: 'ฝนละอองเยือกแข็งหนัก',
        61: 'ฝนเบา',
        63: 'ฝนปานกลาง',
        65: 'ฝนหนัก',
        66: 'ฝนเยือกแข็งเบา',
        67: 'ฝนเยือกแข็งหนัก',
        71: 'หิมะเบา',
        73: 'หิมะปานกลาง',
        75: 'หิมะหนัก',
        77: 'เม็ดหิมะ',
        80: 'ฝนตกปรอยๆ',
        81: 'ฝนตกปานกลาง',
        82: 'ฝนตกหนัก',
        85: 'หิมะตกเบา',
        86: 'หิมะตกหนัก',
        95: 'พายุฝนฟ้าคะนอง',
        96: 'พายุฝนฟ้าคะนองกับลูกเห็บเบา',
        99: 'พายุฝนฟ้าคะนองกับลูกเห็บหนัก'
    };
    
    return weatherCodes[code] || 'ไม่ทราบ';
}

/**
 * ตรวจสอบว่า Weather Code เป็นสภาพอากาศที่มีฝนหรือไม่
 */
function isRainyWeatherCode(code) {
    // Weather codes ที่เกี่ยวกับฝน/พายุ
    const rainyCodes = [
        51, 53, 55,     // Drizzle
        56, 57,         // Freezing Drizzle
        61, 63, 65,     // Rain
        66, 67,         // Freezing Rain
        80, 81, 82,     // Rain showers
        95, 96, 99      // Thunderstorm
    ];
    
    return rainyCodes.includes(code);
}

// =====================================================
// OpenWeatherMap API (สภาพอากาศปัจจุบัน + PM2.5)
// =====================================================

/**
 * ดึงข้อมูลสภาพอากาศปัจจุบัน
 * GET https://api.openweathermap.org/data/2.5/weather
 */
export async function getCurrentWeather(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
    try {
        const url = `${OPENWEATHER_BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=th`;
        
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            throw new Error(`Weather API Error: ${response.status}`);
        }

        const data = await response.json();
        
        return {
            success: true,
            data: normalizeWeatherData(data),
            source: 'openweathermap',
            fetchedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('[Weather] Failed to fetch current weather:', error.message);
        return {
            success: false,
            error: error.message,
            data: null,
            source: 'openweathermap'
        };
    }
}

/**
 * ดึงข้อมูลคุณภาพอากาศ (PM2.5, AQI)
 * GET https://api.openweathermap.org/data/2.5/air_pollution
 */
export async function getAirQuality(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
    try {
        const url = `${OPENWEATHER_BASE_URL}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
        
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            throw new Error(`Air Quality API Error: ${response.status}`);
        }

        const data = await response.json();
        
        return {
            success: true,
            data: normalizeAirQualityData(data),
            source: 'openweathermap',
            fetchedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('[Weather] Failed to fetch air quality:', error.message);
        return {
            success: false,
            error: error.message,
            data: null,
            source: 'openweathermap'
        };
    }
}

/**
 * ดึงพยากรณ์อากาศ 5 วัน (OpenWeatherMap)
 * GET https://api.openweathermap.org/data/2.5/forecast
 */
export async function getWeatherForecast(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
    try {
        const url = `${OPENWEATHER_BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=th&cnt=16`;
        
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            throw new Error(`Forecast API Error: ${response.status}`);
        }

        const data = await response.json();
        
        return {
            success: true,
            data: normalizeForecastData(data),
            source: 'openweathermap',
            fetchedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('[Weather] Failed to fetch forecast:', error.message);
        return {
            success: false,
            error: error.message,
            data: null,
            source: 'openweathermap'
        };
    }
}

/**
 * ดึงข้อมูลรวม Weather + Air Quality + Open-Meteo Forecast
 */
export async function getFullWeatherData(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
    const [weather, airQuality, forecast, openMeteoForecast] = await Promise.all([
        getCurrentWeather(lat, lon),
        getAirQuality(lat, lon),
        getWeatherForecast(lat, lon),
        getOpenMeteoForecast(lat, lon)
    ]);

    return {
        success: weather.success || airQuality.success,
        data: {
            current: weather.data,
            airQuality: airQuality.data,
            forecast: forecast.data,
            openMeteoForecast: openMeteoForecast.data,
            alerts: generateWeatherAlerts(weather.data, airQuality.data)
        },
        source: 'combined',
        fetchedAt: new Date().toISOString()
    };
}

// ==================== Normalizers ====================

/**
 * Normalize weather data (OpenWeatherMap)
 */
function normalizeWeatherData(data) {
    if (!data) return null;

    const weather = data.weather?.[0] || {};
    
    return {
        location: {
            name: data.name,
            country: data.sys?.country,
            lat: data.coord?.lat,
            lon: data.coord?.lon
        },
        temperature: {
            current: Math.round(data.main?.temp * 10) / 10,
            feels_like: Math.round(data.main?.feels_like * 10) / 10,
            min: Math.round(data.main?.temp_min * 10) / 10,
            max: Math.round(data.main?.temp_max * 10) / 10,
            unit: '°C'
        },
        humidity: data.main?.humidity,
        pressure: data.main?.pressure,
        visibility: data.visibility ? Math.round(data.visibility / 1000 * 10) / 10 : null,
        wind: {
            speed: data.wind?.speed,
            speed_kmh: data.wind?.speed ? Math.round(data.wind.speed * 3.6 * 10) / 10 : null,
            deg: data.wind?.deg,
            direction: getWindDirection(data.wind?.deg)
        },
        clouds: data.clouds?.all,
        rain: data.rain ? {
            '1h': data.rain['1h'],
            '3h': data.rain['3h']
        } : null,
        weather: {
            id: weather.id,
            main: weather.main,
            description: weather.description,
            icon: weather.icon,
            icon_url: weather.icon ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png` : null
        },
        sun: {
            sunrise: data.sys?.sunrise ? new Date(data.sys.sunrise * 1000).toISOString() : null,
            sunset: data.sys?.sunset ? new Date(data.sys.sunset * 1000).toISOString() : null
        },
        timestamp: data.dt ? new Date(data.dt * 1000).toISOString() : new Date().toISOString(),
        alerts: generateCurrentWeatherAlerts(data)
    };
}

/**
 * Normalize air quality data
 */
function normalizeAirQualityData(data) {
    if (!data || !data.list?.[0]) return null;

    const airData = data.list[0];
    const components = airData.components || {};
    
    const aqiLabels = {
        1: { label: 'ดี', color: '#00e400', emoji: '😊' },
        2: { label: 'พอใช้', color: '#ffff00', emoji: '🙂' },
        3: { label: 'ปานกลาง', color: '#ff7e00', emoji: '😐' },
        4: { label: 'ไม่ดี', color: '#ff0000', emoji: '😷' },
        5: { label: 'แย่มาก', color: '#7e0023', emoji: '🤢' }
    };
    
    const aqiLevel = airData.main?.aqi || 1;
    const aqiInfo = aqiLabels[aqiLevel] || aqiLabels[1];
    
    const pm25 = components.pm2_5;
    const pm25Level = getPM25Level(pm25);
    
    return {
        aqi: {
            value: aqiLevel,
            label: aqiInfo.label,
            color: aqiInfo.color,
            emoji: aqiInfo.emoji
        },
        components: {
            co: { value: components.co, unit: 'μg/m³', name: 'Carbon Monoxide' },
            no: { value: components.no, unit: 'μg/m³', name: 'Nitrogen Monoxide' },
            no2: { value: components.no2, unit: 'μg/m³', name: 'Nitrogen Dioxide' },
            o3: { value: components.o3, unit: 'μg/m³', name: 'Ozone' },
            so2: { value: components.so2, unit: 'μg/m³', name: 'Sulphur Dioxide' },
            pm2_5: { 
                value: Math.round(pm25 * 10) / 10, 
                unit: 'μg/m³', 
                name: 'PM2.5',
                level: pm25Level.level,
                label: pm25Level.label,
                color: pm25Level.color
            },
            pm10: { 
                value: Math.round(components.pm10 * 10) / 10, 
                unit: 'μg/m³', 
                name: 'PM10' 
            },
            nh3: { value: components.nh3, unit: 'μg/m³', name: 'Ammonia' }
        },
        health_recommendation: getHealthRecommendation(pm25, aqiLevel),
        timestamp: airData.dt ? new Date(airData.dt * 1000).toISOString() : new Date().toISOString(),
        alerts: generateAirQualityAlerts(pm25, aqiLevel)
    };
}

/**
 * Normalize forecast data (OpenWeatherMap)
 */
function normalizeForecastData(data) {
    if (!data || !data.list) return null;

    return {
        location: {
            name: data.city?.name,
            country: data.city?.country
        },
        forecast: data.list.map(item => ({
            timestamp: item.dt ? new Date(item.dt * 1000).toISOString() : null,
            temperature: {
                current: Math.round(item.main?.temp * 10) / 10,
                feels_like: Math.round(item.main?.feels_like * 10) / 10,
                min: Math.round(item.main?.temp_min * 10) / 10,
                max: Math.round(item.main?.temp_max * 10) / 10
            },
            humidity: item.main?.humidity,
            weather: {
                main: item.weather?.[0]?.main,
                description: item.weather?.[0]?.description,
                icon: item.weather?.[0]?.icon,
                icon_url: item.weather?.[0]?.icon 
                    ? `https://openweathermap.org/img/wn/${item.weather[0].icon}.png` 
                    : null
            },
            rain: item.rain?.['3h'] || 0,
            wind_speed: item.wind?.speed
        }))
    };
}

// ==================== Alert Generators ====================

/**
 * Generate alerts from current weather
 */
function generateCurrentWeatherAlerts(data) {
    const alerts = [];
    
    // Rain alert
    if (data.rain?.['1h'] > 0 || data.weather?.[0]?.main?.toLowerCase().includes('rain')) {
        alerts.push({
            type: 'rain',
            level: data.rain?.['1h'] > 10 ? 'warning' : 'info',
            message: `ฝนตก${data.rain?.['1h'] ? ` (${data.rain['1h']} mm/h)` : ''}`,
            value: data.rain?.['1h']
        });
    }
    
    // High temperature
    if (data.main?.temp > 38) {
        alerts.push({
            type: 'heat',
            level: data.main.temp > 40 ? 'critical' : 'warning',
            message: `อากาศร้อนจัด (${Math.round(data.main.temp)}°C)`,
            value: data.main.temp
        });
    }
    
    // Strong wind
    if (data.wind?.speed > 10) {
        alerts.push({
            type: 'wind',
            level: data.wind.speed > 15 ? 'warning' : 'info',
            message: `ลมแรง (${Math.round(data.wind.speed * 3.6)} km/h)`,
            value: data.wind.speed
        });
    }
    
    return alerts;
}

/**
 * Generate alerts from air quality
 */
function generateAirQualityAlerts(pm25, aqi) {
    const alerts = [];
    
    if (pm25 > 100) {
        alerts.push({
            type: 'pm25',
            level: 'critical',
            message: `⚠️ PM2.5 อยู่ในระดับอันตราย (${Math.round(pm25)} μg/m³) หลีกเลี่ยงกิจกรรมกลางแจ้ง`,
            value: pm25
        });
    } else if (pm25 > 75) {
        alerts.push({
            type: 'pm25',
            level: 'warning',
            message: `PM2.5 สูง (${Math.round(pm25)} μg/m³) กลุ่มเสี่ยงควรหลีกเลี่ยงกิจกรรมกลางแจ้ง`,
            value: pm25
        });
    } else if (pm25 > 50) {
        alerts.push({
            type: 'pm25',
            level: 'info',
            message: `PM2.5 เริ่มมีผลต่อสุขภาพ (${Math.round(pm25)} μg/m³)`,
            value: pm25
        });
    }
    
    if (aqi >= 4) {
        alerts.push({
            type: 'aqi',
            level: aqi === 5 ? 'critical' : 'warning',
            message: `คุณภาพอากาศ${aqi === 5 ? 'แย่มาก' : 'ไม่ดี'} (AQI: ${aqi})`,
            value: aqi
        });
    }
    
    return alerts;
}

/**
 * Generate combined weather alerts
 */
function generateWeatherAlerts(weather, airQuality) {
    const alerts = [];
    
    if (weather?.alerts) {
        alerts.push(...weather.alerts);
    }
    
    if (airQuality?.alerts) {
        alerts.push(...airQuality.alerts);
    }
    
    return alerts;
}

// ==================== Helpers ====================

/**
 * Get wind direction name
 */
function getWindDirection(deg) {
    if (deg === undefined || deg === null) return null;
    
    const directions = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 
                       'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
}

/**
 * Get PM2.5 level (Thailand New Standards - เริ่ม 1 มิ.ย. 2566)
 * มาตรฐานไทยใหม่: ≤37.5 μg/m³ (เฉลี่ย 24 ชม.)
 * มาตรฐาน WHO: ≤15 μg/m³ (เฉลี่ย 24 ชม.)
 */
function getPM25Level(pm25) {
    if (pm25 === undefined || pm25 === null) {
        return { level: 'unknown', label: 'ไม่ทราบ', color: '#gray' };
    }
    
    // ระดับ 1: ดีมาก (≤15 - ผ่านมาตรฐาน WHO)
    if (pm25 <= 15) return { 
        level: 'excellent', 
        label: 'ดีมาก', 
        color: '#059669',
        thaiStandard: true,
        whoStandard: true 
    };
    
    // ระดับ 2: ดี (15.1-25 - ผ่านมาตรฐานไทย)
    if (pm25 <= 25) return { 
        level: 'good', 
        label: 'ดี', 
        color: '#10b981',
        thaiStandard: true,
        whoStandard: false 
    };
    
    // ระดับ 3: ปานกลาง (25.1-37.5 - ผ่านมาตรฐานไทย)
    if (pm25 <= 37.5) return { 
        level: 'moderate', 
        label: 'ปานกลาง', 
        color: '#f59e0b',
        thaiStandard: true,
        whoStandard: false 
    };
    
    // ระดับ 4: เริ่มมีผลต่อสุขภาพ (37.6-50 - เกินมาตรฐานไทย)
    if (pm25 <= 50) return { 
        level: 'unhealthy_sensitive', 
        label: 'เริ่มมีผลต่อสุขภาพ', 
        color: '#f97316',
        thaiStandard: false,
        whoStandard: false 
    };
    
    // ระดับ 5: มีผลต่อสุขภาพ (50.1-90)
    if (pm25 <= 90) return { 
        level: 'unhealthy', 
        label: 'มีผลต่อสุขภาพ', 
        color: '#ef4444',
        thaiStandard: false,
        whoStandard: false 
    };
    
    // ระดับ 6: อันตราย (>90)
    return { 
        level: 'hazardous', 
        label: 'อันตราย', 
        color: '#991b1b',
        thaiStandard: false,
        whoStandard: false 
    };
}

/**
 * Get health recommendation based on PM2.5 and AQI
 * อัปเดตตามมาตรฐานไทยใหม่ (37.5 μg/m³)
 */
function getHealthRecommendation(pm25, aqi) {
    if (pm25 > 90 || aqi >= 5) {
        return 'งดกิจกรรมกลางแจ้งทุกชนิด สวมหน้ากาก N95 ตลอดเวลาเมื่อออกนอกอาคาร ควรอยู่ในอาคารที่มีเครื่องฟอกอากาศ';
    }
    if (pm25 > 50 || aqi >= 4) {
        return 'หลีกเลี่ยงกิจกรรมกลางแจ้ง สวมหน้ากาก N95 เมื่อจำเป็น ทุกคนอาจได้รับผลกระทบ';
    }
    if (pm25 > 37.5 || aqi >= 3) {
        return 'ควรลดกิจกรรมกลางแจ้ง สวมหน้ากากอนามัยเมื่อออกนอกอาคาร กลุ่มเสี่ยงควรหลีกเลี่ยงกิจกรรมกลางแจ้ง';
    }
    if (pm25 > 25) {
        return 'คุณภาพอากาศพอใช้ กลุ่มเสี่ยง (เด็ก ผู้สูงอายุ ผู้ป่วยโรคหัวใจ/ปอด) ควรระวัง';
    }
    if (pm25 > 15) {
        return 'คุณภาพอากาศดี สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ ผู้ที่มีโรคทางเดินหายใจควรสังเกตอาการ';
    }
    return 'คุณภาพอากาศดีมาก เหมาะสำหรับทุกกิจกรรมกลางแจ้ง';
}

export const weatherService = {
    getCurrentWeather,
    getAirQuality,
    getWeatherForecast,
    getOpenMeteoForecast,
    getFullWeatherData
};

export default weatherService;
