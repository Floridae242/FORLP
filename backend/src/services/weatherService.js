// filepath: /Users/floridae/Desktop/FORLP/backend/src/services/weatherService.js
/**
 * OpenWeatherMap API Service
 * เชื่อมต่อกับ OpenWeatherMap สำหรับ:
 * - Weather (สภาพอากาศ ฝน/อุณหภูมิ)
 * - Air Quality (PM2.5, AQI)
 */

import { config } from '../config/index.js';

// =====================================================
// Kad Kong Ta Smart Insight - Weather Service
// เชื่อมต่อ OpenWeatherMap API จริง
// =====================================================

const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';
const API_KEY = process.env.OPENWEATHER_API_KEY || '2e840e910703cfed79919cef0a09f771';

// Default location: กาดก้องตา ลำปาง
const DEFAULT_LAT = parseFloat(process.env.DEFAULT_LAT) || 18.2816;
const DEFAULT_LON = parseFloat(process.env.DEFAULT_LON) || 99.5082;

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
 * ดึงพยากรณ์อากาศ 5 วัน
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
 * ดึงข้อมูลรวม Weather + Air Quality
 */
export async function getFullWeatherData(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
    const [weather, airQuality, forecast] = await Promise.all([
        getCurrentWeather(lat, lon),
        getAirQuality(lat, lon),
        getWeatherForecast(lat, lon)
    ]);

    return {
        success: weather.success || airQuality.success,
        data: {
            current: weather.data,
            airQuality: airQuality.data,
            forecast: forecast.data,
            alerts: generateWeatherAlerts(weather.data, airQuality.data)
        },
        source: 'openweathermap',
        fetchedAt: new Date().toISOString()
    };
}

// ==================== Normalizers ====================

/**
 * Normalize weather data
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
        visibility: data.visibility ? Math.round(data.visibility / 1000 * 10) / 10 : null, // km
        wind: {
            speed: data.wind?.speed, // m/s
            speed_kmh: data.wind?.speed ? Math.round(data.wind.speed * 3.6 * 10) / 10 : null, // km/h
            deg: data.wind?.deg,
            direction: getWindDirection(data.wind?.deg)
        },
        clouds: data.clouds?.all, // %
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
    
    // AQI levels: 1=Good, 2=Fair, 3=Moderate, 4=Poor, 5=Very Poor
    const aqiLabels = {
        1: { label: 'ดี', color: '#00e400', emoji: '😊' },
        2: { label: 'พอใช้', color: '#ffff00', emoji: '🙂' },
        3: { label: 'ปานกลาง', color: '#ff7e00', emoji: '😐' },
        4: { label: 'ไม่ดี', color: '#ff0000', emoji: '😷' },
        5: { label: 'แย่มาก', color: '#7e0023', emoji: '🤢' }
    };
    
    const aqiLevel = airData.main?.aqi || 1;
    const aqiInfo = aqiLabels[aqiLevel] || aqiLabels[1];
    
    // PM2.5 levels (Thailand standards)
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
 * Normalize forecast data
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
 * Get PM2.5 level (Thailand standards)
 */
function getPM25Level(pm25) {
    if (pm25 === undefined || pm25 === null) {
        return { level: 'unknown', label: 'ไม่ทราบ', color: '#gray' };
    }
    
    if (pm25 <= 25) return { level: 'good', label: 'ดีมาก', color: '#00e400' };
    if (pm25 <= 37) return { level: 'moderate', label: 'ดี', color: '#92d050' };
    if (pm25 <= 50) return { level: 'sensitive', label: 'ปานกลาง', color: '#ffff00' };
    if (pm25 <= 90) return { level: 'unhealthy', label: 'เริ่มมีผลต่อสุขภาพ', color: '#ff7e00' };
    if (pm25 <= 150) return { level: 'very_unhealthy', label: 'มีผลต่อสุขภาพ', color: '#ff0000' };
    return { level: 'hazardous', label: 'อันตราย', color: '#7e0023' };
}

/**
 * Get health recommendation based on PM2.5 and AQI
 */
function getHealthRecommendation(pm25, aqi) {
    if (pm25 > 100 || aqi >= 5) {
        return 'หลีกเลี่ยงกิจกรรมกลางแจ้ง สวมหน้ากาก N95 เมื่อออกนอกอาคาร';
    }
    if (pm25 > 75 || aqi >= 4) {
        return 'กลุ่มเสี่ยงควรหลีกเลี่ยงกิจกรรมกลางแจ้ง ควรสวมหน้ากากอนามัย';
    }
    if (pm25 > 50 || aqi >= 3) {
        return 'ผู้ที่มีโรคประจำตัวควรระวัง ควรลดกิจกรรมกลางแจ้งที่ใช้แรงมาก';
    }
    if (pm25 > 25) {
        return 'คุณภาพอากาศพอใช้ สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ';
    }
    return 'คุณภาพอากาศดี เหมาะสำหรับกิจกรรมกลางแจ้ง';
}

export const weatherService = {
    getCurrentWeather,
    getAirQuality,
    getWeatherForecast,
    getFullWeatherData
};

export default weatherService;
