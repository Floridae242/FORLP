// =====================================================
// Kad Kong Ta Smart Insight - Frontend API (Simplified)
// =====================================================

const API_BASE = '/api';

// Error Messages ภาษาไทย
const ERROR_MESSAGES = {
    NETWORK_ERROR: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้',
    TIMEOUT: 'การเชื่อมต่อใช้เวลานานเกินไป',
    SERVER_ERROR: 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์',
    NOT_FOUND: 'ไม่พบข้อมูลที่ต้องการ',
    DEFAULT: 'เกิดข้อผิดพลาด กรุณาลองใหม่'
};

class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        clearTimeout(timeout);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new ApiError(data.error || 'Request failed', response.status);
        }

        return data;
    } catch (error) {
        clearTimeout(timeout);
        
        if (error.name === 'AbortError') {
            throw new ApiError(ERROR_MESSAGES.TIMEOUT, 408);
        }
        if (error instanceof ApiError) {
            throw error;
        }
        if (!navigator.onLine) {
            throw new ApiError(ERROR_MESSAGES.NETWORK_ERROR, 0);
        }
        throw new ApiError(error.message || ERROR_MESSAGES.DEFAULT, 500);
    }
}

export function showError(error) {
    if (error instanceof ApiError) {
        return error.message;
    }
    return ERROR_MESSAGES.DEFAULT;
}

export const api = {
    // Health check
    health: () => request('/health'),

    // ==================== Dashboard ====================
    getDashboard: () => request(`${API_BASE}/dashboard`),

    // ==================== Zones ====================
    getZones: () => request(`${API_BASE}/zones`),
    getZone: (code) => request(`${API_BASE}/zones/${code}`),

    // ==================== Weather ====================
    getWeather: () => request(`${API_BASE}/weather`),

    // ==================== Reports ====================
    getReportHistory: (limit = 30) => 
        request(`${API_BASE}/reports/history?limit=${limit}`),

    // ==================== System ====================
    getSystemStatus: () => request(`${API_BASE}/system/status`)
};

// Zone names ภาษาไทย
export const ZONE_NAMES = {
    'A': 'โซน A - ทางเข้าหลัก',
    'B': 'โซน B - ตลาดกลาง',
    'C': 'โซน C - โซนอาหาร'
};

// PM2.5 levels
export const PM25_LEVELS = {
    good: { label: 'ดีมาก', color: '#00e400' },
    moderate: { label: 'ดี', color: '#92d050' },
    sensitive: { label: 'ปานกลาง', color: '#ffff00' },
    unhealthy: { label: 'เริ่มมีผลต่อสุขภาพ', color: '#ff7e00' },
    very_unhealthy: { label: 'มีผลต่อสุขภาพ', color: '#ff0000' },
    hazardous: { label: 'อันตราย', color: '#7e0023' }
};

export function getPM25Level(pm25) {
    if (pm25 === null || pm25 === undefined) return null;
    if (pm25 <= 25) return PM25_LEVELS.good;
    if (pm25 <= 37) return PM25_LEVELS.moderate;
    if (pm25 <= 50) return PM25_LEVELS.sensitive;
    if (pm25 <= 90) return PM25_LEVELS.unhealthy;
    if (pm25 <= 150) return PM25_LEVELS.very_unhealthy;
    return PM25_LEVELS.hazardous;
}

export { ApiError, ERROR_MESSAGES };
