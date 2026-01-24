// =====================================================
// Kad Kong Ta Smart Insight - Configuration (Simplified)
// ระบบติดตามอัจฉริยะ ถนนคนเดินกาดก้องตา
// Version: 2.0 - Minimal
// =====================================================

import 'dotenv/config';

export const config = {
    // ==================== General Settings ====================
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    mockMode: process.env.MOCK_MODE !== 'false', // Default to mock mode
    
    // ==================== Database ====================
    dbPath: process.env.DB_PATH || './data/kadkongta.db',

    // ==================== Location (กาดก้องตา ลำปาง) ====================
    defaultLat: parseFloat(process.env.DEFAULT_LAT) || 18.2816,
    defaultLon: parseFloat(process.env.DEFAULT_LON) || 99.5082,

    // ==================== LINE OA Integration ====================
    lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',

    // ==================== OpenWeatherMap API ====================
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY || '',

    // ==================== Camera/People Count API ====================
    cameraApiUrl: process.env.CAMERA_API_URL || '',
    cameraApiKey: process.env.CAMERA_API_KEY || '',

    // ==================== Polling Settings ====================
    pollingInterval: parseInt(process.env.POLLING_INTERVAL) || 60000, // 60 seconds

    // ==================== Daily Report Settings ====================
    dailyReportHour: parseInt(process.env.DAILY_REPORT_HOUR) || 18, // 18:00
    dailyReportMinute: parseInt(process.env.DAILY_REPORT_MINUTE) || 0,

    // ==================== Zone Configuration ====================
    zones: ['A', 'B', 'C']
};

// Validation helper
export function validateConfig() {
    const warnings = [];
    const errors = [];
    
    // Required for LINE Daily Report
    if (!config.lineChannelAccessToken) {
        warnings.push('LINE_CHANNEL_ACCESS_TOKEN not set - Daily Report จะไม่ถูกส่งไป LINE');
    }
    
    // Required for Weather & PM2.5
    if (!config.openWeatherApiKey) {
        warnings.push('OPENWEATHER_API_KEY not set - จะใช้ Mock Data สำหรับ Weather/PM2.5');
    }
    
    // Camera API (optional - will use mock if not set)
    if (!config.cameraApiUrl) {
        warnings.push('CAMERA_API_URL not set - จะใช้ Mock Data สำหรับ People Count');
    }
    
    if (warnings.length > 0) {
        console.warn('');
        console.warn('⚠️  Configuration warnings:');
        warnings.forEach(w => console.warn(`   - ${w}`));
        console.warn('');
    }
    
    if (errors.length > 0) {
        console.error('❌ Configuration errors:');
        errors.forEach(e => console.error(`   - ${e}`));
        throw new Error('Invalid configuration');
    }
    
    return { warnings, errors };
}

export default config;
