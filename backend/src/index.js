// =====================================================
// Kad Kong Ta Smart Insight - Main Server (Simplified)
// ระบบติดตามอัจฉริยะ ถนนคนเดินกาดก้องตา
// Version: 2.0 - Minimal
// =====================================================

import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/index.js';
import { initDatabase } from './db/index.js';
import { startPolling, getPollingStatus, forcePoll, forceDailyReport, forceEarlyWarning } from './services/pollingService.js';
import { peopleCountService } from './services/peopleCountService.js';
import { weatherService } from './services/weatherService.js';
import { dailyReportService } from './services/dailyReportService.js';
import { earlyWarningService } from './services/earlyWarningService.js';

const app = express();

// ==================== Middleware ====================
app.use(cors());
app.use(express.json());

// Request logging (development only)
if (config.nodeEnv === 'development') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        next();
    });
}

// ==================== Health Check ====================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        mode: config.mockMode ? 'mock' : 'live',
        version: '2.0.0',
        system: 'Kad Kong Ta Smart Insight',
        timestamp: new Date().toISOString() 
    });
});

// ==================== Root Endpoint ====================
app.get('/', (req, res) => {
    res.json({
        success: true,
        name: 'Kad Kong Ta Smart Insight API',
        version: '2.0.0',
        description: 'ระบบติดตามอัจฉริยะ ถนนคนเดินกาดก้องตา (Minimal)',
        mode: config.mockMode ? 'mock' : 'live',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            dashboard: '/api/dashboard',
            zones: '/api/zones',
            weather: '/api/weather',
            reports: '/api/reports',
            earlyWarning: '/api/early-warning'
        }
    });
});

// ==================== Dashboard API ====================
// GET /api/dashboard - ข้อมูลรวมสำหรับแสดงผล
app.get('/api/dashboard', async (req, res) => {
    try {
        // ดึงข้อมูลจำนวนคนล่าสุด
        const peopleCounts = peopleCountService.getLatestCounts();
        
        // ดึงข้อมูล Weather และ PM2.5
        let weather = null;
        let airQuality = null;
        
        try {
            const [weatherResult, airResult] = await Promise.all([
                weatherService.getCurrentWeather(),
                weatherService.getAirQuality()
            ]);
            
            if (weatherResult.success) {
                weather = {
                    temperature: weatherResult.data?.temperature?.current,
                    humidity: weatherResult.data?.humidity,
                    description: weatherResult.data?.weather?.description,
                    icon: weatherResult.data?.weather?.icon_url
                };
            }
            
            if (airResult.success) {
                airQuality = {
                    pm25: airResult.data?.components?.pm2_5?.value,
                    pm25_level: airResult.data?.components?.pm2_5?.label,
                    aqi: airResult.data?.aqi
                };
            }
        } catch (err) {
            console.warn('[Dashboard] Weather/Air API error:', err.message);
        }
        
        // คำนวณยอดรวม
        const totalPeople = peopleCounts.reduce((sum, z) => sum + z.people_count, 0);
        
        res.json({
            success: true,
            data: {
                timestamp: new Date().toISOString(),
                location: 'กาดก้องตา ลำปาง',
                
                // จำนวนคนแต่ละ Zone
                zones: peopleCounts.map(z => ({
                    zone_code: z.zone_code,
                    zone_name: z.zone_name,
                    people_count: z.people_count,
                    capacity: z.capacity,
                    percent: z.capacity > 0 ? Math.round((z.people_count / z.capacity) * 100) : 0
                })),
                
                // ยอดรวม
                total_people: totalPeople,
                
                // สภาพอากาศ
                weather: weather || { description: 'ไม่สามารถดึงข้อมูลได้' },
                
                // คุณภาพอากาศ
                air_quality: airQuality || { pm25: null, pm25_level: 'ไม่มีข้อมูล' },
                
                // System info
                system: {
                    mode: config.mockMode ? 'mock' : 'live',
                    polling: getPollingStatus()
                }
            }
        });
    } catch (error) {
        console.error('[Dashboard] Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'ไม่สามารถดึงข้อมูลได้',
            message: error.message
        });
    }
});

// ==================== Zones API ====================
// GET /api/zones - ข้อมูลจำนวนคนแต่ละ Zone
app.get('/api/zones', (req, res) => {
    try {
        const peopleCounts = peopleCountService.getLatestCounts();
        
        res.json({
            success: true,
            data: peopleCounts.map(z => ({
                zone_code: z.zone_code,
                zone_name: z.zone_name,
                people_count: z.people_count,
                capacity: z.capacity,
                percent: z.capacity > 0 ? Math.round((z.people_count / z.capacity) * 100) : 0,
                recorded_at: z.recorded_at
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/zones/:code - ข้อมูล Zone เดียว
app.get('/api/zones/:code', (req, res) => {
    try {
        const { code } = req.params;
        const peopleCounts = peopleCountService.getLatestCounts();
        const zone = peopleCounts.find(z => z.zone_code.toUpperCase() === code.toUpperCase());
        
        if (!zone) {
            return res.status(404).json({ success: false, error: 'ไม่พบ Zone นี้' });
        }
        
        res.json({
            success: true,
            data: {
                zone_code: zone.zone_code,
                zone_name: zone.zone_name,
                people_count: zone.people_count,
                capacity: zone.capacity,
                percent: zone.capacity > 0 ? Math.round((zone.people_count / zone.capacity) * 100) : 0,
                recorded_at: zone.recorded_at
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== Weather API ====================
// GET /api/weather - สภาพอากาศและ PM2.5
app.get('/api/weather', async (req, res) => {
    try {
        const [weatherResult, airResult] = await Promise.all([
            weatherService.getCurrentWeather(),
            weatherService.getAirQuality()
        ]);
        
        res.json({
            success: true,
            data: {
                weather: weatherResult.success ? {
                    temperature: weatherResult.data?.temperature?.current,
                    feels_like: weatherResult.data?.temperature?.feels_like,
                    humidity: weatherResult.data?.humidity,
                    description: weatherResult.data?.weather?.description,
                    icon: weatherResult.data?.weather?.icon_url,
                    wind_speed: weatherResult.data?.wind?.speed_kmh
                } : null,
                
                air_quality: airResult.success ? {
                    pm25: airResult.data?.components?.pm2_5?.value,
                    pm25_level: airResult.data?.components?.pm2_5?.label,
                    pm25_color: airResult.data?.components?.pm2_5?.color,
                    aqi: airResult.data?.aqi,
                    recommendation: airResult.data?.health_recommendation
                } : null,
                
                fetched_at: new Date().toISOString(),
                errors: {
                    weather: weatherResult.success ? null : weatherResult.error,
                    air_quality: airResult.success ? null : airResult.error
                }
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'ไม่สามารถดึงข้อมูลสภาพอากาศได้',
            message: error.message 
        });
    }
});

// ==================== Reports API ====================
// GET /api/reports/daily - รายงานประจำวันล่าสุด
app.get('/api/reports/daily', (req, res) => {
    try {
        const { date } = req.query;
        
        let report;
        if (date) {
            report = dailyReportService.getReportByDate(date);
        } else {
            report = dailyReportService.getLatestReport();
        }
        
        if (!report) {
            return res.status(404).json({ 
                success: false, 
                error: 'ไม่พบรายงาน',
                message: date ? `ไม่พบรายงานวันที่ ${date}` : 'ยังไม่มีรายงาน'
            });
        }
        
        res.json({ success: true, data: report });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/reports/history - รายงานย้อนหลัง
app.get('/api/reports/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 7;
        const reports = dailyReportService.getRecentReports(limit);
        
        res.json({ 
            success: true, 
            data: reports,
            count: reports.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/reports/generate - สร้างรายงานใหม่ (manual trigger)
app.post('/api/reports/generate', async (req, res) => {
    try {
        const { date, send_line } = req.body;
        
        if (send_line) {
            // สร้างและส่ง LINE
            const result = await forceDailyReport(date);
            res.json({ success: true, data: result });
        } else {
            // สร้างรายงานอย่างเดียว
            const result = await dailyReportService.generateDailyReport(date);
            res.json({ success: true, data: result });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== Early Warning API ====================
// GET /api/early-warning/status - สถานะระบบแจ้งเตือน
app.get('/api/early-warning/status', (req, res) => {
    try {
        const status = earlyWarningService.getEarlyWarningStatus();
        const pollingStatus = getPollingStatus();
        
        res.json({
            success: true,
            data: {
                ...status,
                nextAlertTime: pollingStatus.earlyWarningTime,
                nextAlertDate: pollingStatus.nextEarlyWarningDate,
                scheduled: pollingStatus.earlyWarningScheduled
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/early-warning/assess - ประเมินความเสี่ยงปัจจุบัน (ไม่ส่งแจ้งเตือน)
app.get('/api/early-warning/assess', async (req, res) => {
    try {
        const assessment = await earlyWarningService.assessAllRisks();
        const message = earlyWarningService.generateWarningMessage(assessment);
        
        res.json({
            success: true,
            data: {
                assessment,
                previewMessage: message,
                wouldSendAlert: assessment.hasAnyRisk
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/early-warning/trigger - บังคับส่งแจ้งเตือนทันที (manual trigger)
app.post('/api/early-warning/trigger', async (req, res) => {
    try {
        const result = await forceEarlyWarning();
        
        res.json({
            success: result.success,
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== System API ====================
// GET /api/system/status - สถานะระบบ
app.get('/api/system/status', (req, res) => {
    res.json({
        success: true,
        data: {
            mode: config.mockMode ? 'mock' : 'live',
            polling: getPollingStatus(),
            config: {
                line_configured: !!config.lineChannelAccessToken,
                weather_configured: !!config.openWeatherApiKey,
                camera_configured: !!config.cameraApiUrl
            },
            timestamp: new Date().toISOString()
        }
    });
});

// POST /api/system/refresh - Force refresh data
app.post('/api/system/refresh', async (req, res) => {
    try {
        await forcePoll();
        res.json({ success: true, message: 'ข้อมูลถูกอัพเดทแล้ว' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== API Documentation ====================
app.get('/api', (req, res) => {
    res.json({
        name: 'Kad Kong Ta Smart Insight API',
        version: '2.0.0',
        description: 'ระบบติดตามอัจฉริยะ ถนนคนเดินกาดก้องตา (Minimal)',
        mode: config.mockMode ? 'mock' : 'live',
        endpoints: {
            dashboard: {
                'GET /api/dashboard': 'ข้อมูลรวมสำหรับแสดงผล Dashboard'
            },
            zones: {
                'GET /api/zones': 'ข้อมูลจำนวนคนทุก Zone',
                'GET /api/zones/:code': 'ข้อมูลจำนวนคน Zone เดียว (A, B, C)'
            },
            weather: {
                'GET /api/weather': 'สภาพอากาศและคุณภาพอากาศ (PM2.5)'
            },
            reports: {
                'GET /api/reports/daily': 'รายงานประจำวันล่าสุด',
                'GET /api/reports/daily?date=YYYY-MM-DD': 'รายงานประจำวันตามวันที่',
                'GET /api/reports/history': 'รายงานย้อนหลัง 7 วัน',
                'POST /api/reports/generate': 'สร้างรายงานใหม่ (manual)'
            },
            earlyWarning: {
                'GET /api/early-warning/status': 'สถานะระบบแจ้งเตือนความเสี่ยง',
                'GET /api/early-warning/assess': 'ประเมินความเสี่ยงปัจจุบัน (preview)',
                'POST /api/early-warning/trigger': 'บังคับส่งแจ้งเตือนทันที (manual)'
            },
            system: {
                'GET /api/system/status': 'สถานะระบบ',
                'POST /api/system/refresh': 'Force refresh ข้อมูล'
            }
        }
    });
});

// ==================== Error Handler ====================
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.status || 500).json({ 
        success: false,
        error: err.message
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false,
        error: 'Endpoint not found',
        path: req.path 
    });
});

// ==================== Initialize and Start ====================
async function start() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     🏮 Kad Kong Ta Smart Insight - Backend Server 🏮      ║');
    console.log('║     ระบบติดตามอัจฉริยะ ถนนคนเดินกาดก้องตา                  ║');
    console.log('║     Version 2.0 - Minimal                                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    try {
        // Validate configuration
        console.log('📋 Validating configuration...');
        validateConfig();

        // Initialize database
        console.log('💾 Initializing database...');
        await initDatabase();

        // Start polling service
        console.log('🔄 Starting polling service...');
        startPolling();

        // Start server
        app.listen(config.port, () => {
            console.log('');
            console.log(`🚀 Server running on http://localhost:${config.port}`);
            console.log(`📊 Dashboard API: http://localhost:${config.port}/api/dashboard`);
            console.log(`📖 API Docs: http://localhost:${config.port}/api`);
            console.log('');
            console.log('🔌 Configuration:');
            console.log(`   - Mode: ${config.mockMode ? '🎭 Mock Data' : '📡 Live Data'}`);
            console.log(`   - LINE OA: ${config.lineChannelAccessToken ? '✓ Configured' : '✗ Not configured'}`);
            console.log(`   - Weather API: ${config.openWeatherApiKey ? '✓ Configured' : '✗ Not configured'}`);
            console.log(`   - Camera API: ${config.cameraApiUrl ? '✓ Configured' : '✗ Not configured'}`);
            console.log('');
            console.log('📋 Features:');
            console.log('   ✓ People Count (Zone A, B, C)');
            console.log('   ✓ Weather & PM2.5');
            console.log('   ✓ Daily Report to LINE OA');
            console.log('   ✓ Early Warning Alert (Sat-Sun 14:00)');
            console.log('');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

start();

export default app;
