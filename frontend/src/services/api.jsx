// filepath: /Users/floridae/Desktop/FORLP/frontend/src/services/api.jsx
/* =====================================================
   API Service - เรียก Backend API จริง
   ตาม PROMPT: ไม่ใช้ mock data แล้ว
   ===================================================== */

// Backend API URL (Railway production หรือ localhost dev)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://forlp-production.up.railway.app';

// Default fetch options
const defaultOptions = {
    headers: {
        'Content-Type': 'application/json',
    },
};

/**
 * Base fetch wrapper with error handling
 */
async function apiFetch(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
        const response = await fetch(url, {
            ...defaultOptions,
            ...options,
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `API Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`[API] ${endpoint} error:`, error.message);
        throw error;
    }
}

// =====================================================
// PEOPLE COUNT APIs (ตาม PROMPT)
// =====================================================

/**
 * GET /api/people/current - จำนวนคนปัจจุบัน (Real-time from AI)
 * Returns: { count, smoothed_count, status, status_label, timestamp, source, source_latency_s, is_stale }
 */
export async function getCurrentPeopleCount() {
    const result = await apiFetch('/api/people/current');
    return result.data;
}

/**
 * GET /api/people/daily?date=YYYY-MM-DD - สรุปรายวัน
 * Returns: { date, max_people, avg_people, min_people, total_samples, status, status_label }
 */
export async function getDailySummary(date = null) {
    const endpoint = date ? `/api/people/daily?date=${date}` : '/api/people/daily';
    const result = await apiFetch(endpoint);
    return result.data;
}

/**
 * GET /api/people/stats - สถิติล่าสุด (สำหรับ Dashboard)
 */
export async function getPeopleStats() {
    const result = await apiFetch('/api/people/stats');
    return result.data;
}

/**
 * GET /api/people/crowd-level - ระดับความแออัดปัจจุบัน
 */
export async function getCrowdLevel() {
    const result = await apiFetch('/api/people/crowd-level');
    return result.data;
}

/**
 * GET /api/people/history?days=N - ข้อมูลย้อนหลัง
 */
export async function getHistoricalData(days = 7) {
    const result = await apiFetch(`/api/people/history?days=${days}`);
    return result.data;
}

/**
 * GET /api/people/hourly?date=YYYY-MM-DD - ข้อมูลรายชั่วโมง
 */
export async function getHourlyData(date = null) {
    const endpoint = date ? `/api/people/hourly?date=${date}` : '/api/people/hourly';
    const result = await apiFetch(endpoint);
    return result.data;
}

// =====================================================
// WEATHER APIs
// =====================================================

/**
 * GET /api/weather/current - สภาพอากาศปัจจุบัน
 */
export async function getCurrentWeather() {
    const result = await apiFetch('/api/weather/current');
    return result.data;
}

/**
 * GET /api/warnings/forecast - พยากรณ์อากาศรายชั่วโมง
 */
export async function getWeatherForecast() {
    const result = await apiFetch('/api/warnings/forecast');
    return result.data;
}

/**
 * GET /api/warnings/rain-check - ตรวจสอบพยากรณ์ฝน
 */
export async function checkRainForecast() {
    const result = await apiFetch('/api/warnings/rain-check');
    return result.data;
}

// =====================================================
// DASHBOARD API
// =====================================================

/**
 * GET /api/dashboard - ข้อมูลรวมสำหรับ Dashboard
 */
export async function getDashboardData() {
    const result = await apiFetch('/api/dashboard');
    return result.data;
}

// =====================================================
// REPORTS APIs
// =====================================================

/**
 * GET /api/reports/daily?date=YYYY-MM-DD - รายงานประจำวัน
 */
export async function getDailyReport(date = null) {
    const endpoint = date ? `/api/reports/daily?date=${date}` : '/api/reports/daily';
    const result = await apiFetch(endpoint);
    return result.data;
}

/**
 * GET /api/reports/weekly - รายงานรายสัปดาห์
 */
export async function getWeeklyReport() {
    const result = await apiFetch('/api/reports/weekly');
    return result.data;
}

/**
 * GET /api/reports/history?days=N - ประวัติรายงาน
 */
export async function getReportHistory(days = 30) {
    const result = await apiFetch(`/api/reports/history?days=${days}`);
    return result.data;
}

// =====================================================
// HEALTH CHECK
// =====================================================

/**
 * GET /health - ตรวจสอบสถานะ server
 */
export async function checkHealth() {
    const result = await apiFetch('/health');
    return result;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * คำนวณ staleness (วินาที)
 */
export function calculateStaleness(timestamp) {
    if (!timestamp) return Infinity;
    const now = new Date();
    const ts = new Date(timestamp);
    return Math.round((now - ts) / 1000);
}

/**
 * ตรวจสอบว่าข้อมูล stale หรือไม่ (> 2 นาที)
 */
export function isDataStale(timestamp, thresholdSeconds = 120) {
    return calculateStaleness(timestamp) > thresholdSeconds;
}

/**
 * Format staleness เป็นข้อความ
 */
export function formatStaleness(seconds) {
    if (seconds < 60) return `${seconds} วินาที`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} นาที`;
    return `${Math.round(seconds / 3600)} ชั่วโมง`;
}

// =====================================================
// EXPORTS
// =====================================================

export const api = {
    // People Count
    getCurrentPeopleCount,
    getDailySummary,
    getPeopleStats,
    getCrowdLevel,
    getHistoricalData,
    getHourlyData,
    
    // Weather
    getCurrentWeather,
    getWeatherForecast,
    checkRainForecast,
    
    // Dashboard
    getDashboardData,
    
    // Reports
    getDailyReport,
    getWeeklyReport,
    getReportHistory,
    
    // Health
    checkHealth,
    
    // Utilities
    calculateStaleness,
    isDataStale,
    formatStaleness,
    
    // Config
    API_BASE_URL,
};

export default api;
