// =====================================================
// Kad Kong Ta Smart Insight - Main Server
// Single Zone People Counting + AI Integration
// =====================================================

import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/index.js';
import { initDatabase } from './db/index.js';
import { peopleCountService } from './services/peopleCountService.js';
import { weatherService } from './services/weatherService.js';
import { dailyReportService } from './services/dailyReportService.js';
import { earlyWarningService } from './services/earlyWarningService.js';

const app = express();

// ==================== Middleware ====================
app.use(cors());
app.use(express.json());

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
        version: '3.0.0',
        system: 'Kad Kong Ta - AI People Counter',
        timestamp: new Date().toISOString() 
    });
});

// ==================== PEOPLE COUNT APIs ====================

// GET /api/people/current - จำนวนคนปัจจุบัน (Real-time)
app.get('/api/people/current', (req, res) => {
    const data = peopleCountService.getCurrentCount();
    
    // ถ้ายังไม่มีข้อมูล ให้ generate mock
    if (data.count === 0 && !data.timestamp) {
        const mock = peopleCountService.generateMockCount();
        return res.json({
            success: true,
            data: mock,
            source: 'mock'
        });
    }
    
    res.json({
        success: true,
        data: data
    });
});

// POST /api/people/ingest - รับข้อมูลจาก AI Service
app.post('/api/people/ingest', (req, res) => {
    const { count, timestamp } = req.body;
    
    if (typeof count !== 'number' || count < 0) {
        return res.status(400).json({
            success: false,
            error: 'Invalid count value'
        });
    }
    
    const result = peopleCountService.ingestPeopleCount(count, timestamp);
    
    console.log(`[Ingest] People count: ${count}`);
    
    res.json({
        success: true,
        data: result
    });
});

// GET /api/people/summary - สรุปรายวัน
app.get('/api/people/summary', (req, res) => {
    const { date } = req.query;
    const summary = peopleCountService.getDailySummary(date);
    
    res.json({
        success: true,
        data: summary
    });
});

// GET /api/people/history - ข้อมูลย้อนหลัง
app.get('/api/people/history', (req, res) => {
    const days = parseInt(req.query.days) || 7;
    const history = peopleCountService.getHistoricalData(days);
    
    res.json({
        success: true,
        data: history,
        count: history.length
    });
});

// GET /api/people/hourly - ข้อมูลรายชั่วโมง
app.get('/api/people/hourly', (req, res) => {
    const { date } = req.query;
    const hourly = peopleCountService.getHourlyData(date);
    
    res.json({
        success: true,
        data: hourly
    });
});

// ==================== DASHBOARD API ====================

// GET /api/dashboard - ข้อมูลรวมสำหรับ Dashboard
app.get('/api/dashboard', async (req, res) => {
    try {
        // จำนวนคนปัจจุบัน
        let peopleData = peopleCountService.getCurrentCount();
        
        if (peopleData.count === 0 && !peopleData.timestamp) {
            peopleData = peopleCountService.generateMockCount();
        }
        
        // Weather
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
                    description: weatherResult.data?.weather?.description
                };
            }
            
            if (airResult.success) {
                airQuality = {
                    pm25: airResult.data?.components?.pm2_5?.value,
                    pm25_level: airResult.data?.components?.pm2_5?.label
                };
            }
        } catch (err) {
            console.warn('[Dashboard] Weather error:', err.message);
        }
        
        res.json({
            success: true,
            data: {
                people: {
                    count: peopleData.count,
                    timestamp: peopleData.timestamp
                },
                weather: weather,
                air_quality: airQuality,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== REPORTS API ====================

// GET /api/reports/daily - รายงานประจำวัน
app.get('/api/reports/daily', (req, res) => {
    try {
        const { date } = req.query;
        const summary = peopleCountService.getDailySummary(date);
        const hourly = peopleCountService.getHourlyData(date);
        
        res.json({
            success: true,
            data: {
                summary: summary,
                hourly: hourly
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/reports/weekly - รายงานรายสัปดาห์
app.get('/api/reports/weekly', (req, res) => {
    try {
        const history = peopleCountService.getHistoricalData(7);
        
        const totalMax = Math.max(...history.map(d => d.max_people || 0), 0);
        const avgPeople = history.length > 0 
            ? Math.round(history.reduce((sum, d) => sum + (d.avg_people || 0), 0) / history.length)
            : 0;
        
        res.json({
            success: true,
            data: {
                summary: {
                    total_days: history.length,
                    max_people: totalMax,
                    avg_people: avgPeople
                },
                daily: history
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/reports/history - ประวัติรายงาน
app.get('/api/reports/history', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const history = peopleCountService.getHistoricalData(days);
        
        res.json({
            success: true,
            data: history,
            count: history.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== WEATHER API ====================

// GET /api/weather/current - สภาพอากาศปัจจุบัน (สำหรับ Frontend)
app.get('/api/weather/current', async (req, res) => {
    try {
        const [weatherResult, airResult] = await Promise.all([
            weatherService.getCurrentWeather(),
            weatherService.getAirQuality()
        ]);
        
        // รวมข้อมูลให้ง่ายต่อการใช้งาน
        const data = {
            temperature: weatherResult.data?.temperature?.current ?? null,
            humidity: weatherResult.data?.humidity ?? null,
            wind_speed: weatherResult.data?.wind?.speed ?? null,
            description: weatherResult.data?.weather?.description ?? 'ไม่มีข้อมูล',
            pm25: airResult.data?.components?.pm2_5?.value ?? null,
            timestamp: new Date().toISOString()
        };
        
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        // ถ้า error ให้ส่ง mock data
        res.json({
            success: true,
            data: {
                temperature: 28,
                humidity: 65,
                wind_speed: 8,
                description: 'อากาศดี',
                pm25: 25,
                timestamp: new Date().toISOString()
            },
            source: 'mock'
        });
    }
});

app.get('/api/weather', async (req, res) => {
    try {
        const [weatherResult, airResult] = await Promise.all([
            weatherService.getCurrentWeather(),
            weatherService.getAirQuality()
        ]);
        
        res.json({
            success: true,
            data: {
                weather: weatherResult.success ? weatherResult.data : null,
                air_quality: airResult.success ? airResult.data : null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== SYSTEM API ====================

app.get('/api/system/status', (req, res) => {
    res.json({
        success: true,
        data: {
            version: '3.0.0',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }
    });
});

// ==================== 404 Handler ====================
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// ==================== Polling Service ====================
let pollingInterval = null;

function startPolling() {
    const interval = 5 * 60 * 1000; // 5 นาที
    
    console.log(`[Polling] Starting with interval ${interval / 1000}s`);
    
    // Poll ครั้งแรก
    pollData();
    
    // ตั้ง interval
    pollingInterval = setInterval(pollData, interval);
}

async function pollData() {
    // ลองดึงจาก AI Service ก่อน
    const result = await peopleCountService.fetchFromAI();
    
    if (!result.success) {
        // ถ้าไม่ได้ ใช้ mock
        peopleCountService.generateMockCount();
        console.log('[Polling] Using mock data');
    } else {
        console.log('[Polling] Got data from AI');
    }
}

// ==================== LINE Notification Scheduler ====================
let lineSchedulerInterval = null;

/**
 * ตรวจสอบและส่ง LINE Notification ตามกำหนดเวลา
 * - Early Warning: ทุกวันเสาร์-อาทิตย์ เวลา 14:00
 * - Daily Report: ทุกวัน เวลา 23:00
 */
function startLineScheduler() {
    console.log('[LINE Scheduler] Starting...');
    
    // ตรวจสอบทุก 1 นาที
    lineSchedulerInterval = setInterval(checkAndSendNotifications, 60 * 1000);
    
    // ตรวจสอบครั้งแรกทันที
    checkAndSendNotifications();
}

// เก็บสถานะว่าส่งไปแล้วหรือยังในแต่ละวัน
const sentToday = {
    earlyWarning: null,  // เก็บวันที่ที่ส่งล่าสุด
    dailyReport: null
};

async function checkAndSendNotifications() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0 = อาทิตย์, 6 = เสาร์
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Early Warning: วันเสาร์-อาทิตย์ เวลา 14:00
    if (isWeekend && hour === 14 && minute === 0 && sentToday.earlyWarning !== today) {
        console.log('[LINE Scheduler] Sending Early Warning...');
        try {
            const result = await earlyWarningService.processEarlyWarning();
            sentToday.earlyWarning = today;
            console.log('[LINE Scheduler] Early Warning result:', result);
        } catch (error) {
            console.error('[LINE Scheduler] Early Warning error:', error.message);
        }
    }
    
    // Daily Report: ทุกวัน เวลา 23:00
    if (hour === 23 && minute === 0 && sentToday.dailyReport !== today) {
        console.log('[LINE Scheduler] Sending Daily Report...');
        try {
            const result = await dailyReportService.processAndSendDailyReport(today);
            sentToday.dailyReport = today;
            console.log('[LINE Scheduler] Daily Report result:', result);
        } catch (error) {
            console.error('[LINE Scheduler] Daily Report error:', error.message);
        }
    }
}

// ==================== Start Server ====================
async function start() {
    console.log('');
    console.log('🏮 Kad Kong Ta - AI People Counter v3.0');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
        console.log('📋 Validating configuration...');
        validateConfig();

        console.log('💾 Initializing database...');
        await initDatabase();

        console.log('🔄 Starting polling service...');
        startPolling();
        
        console.log('📱 Starting LINE notification scheduler...');
        startLineScheduler();

        app.listen(config.port, () => {
            console.log('');
            console.log(`🚀 Server: http://localhost:${config.port}`);
            console.log('');
            console.log('📡 API Endpoints:');
            console.log(`   GET  /api/people/current  - จำนวนคนปัจจุบัน`);
            console.log(`   POST /api/people/ingest   - รับข้อมูลจาก AI`);
            console.log(`   GET  /api/reports/daily   - รายงานรายวัน`);
            console.log(`   GET  /api/reports/weekly  - รายงานรายสัปดาห์`);
            console.log('');
            console.log('📱 LINE Notifications:');
            console.log('   ⚠️  Early Warning  - เสาร์-อาทิตย์ 14:00');
            console.log('   📊 Daily Report   - ทุกวัน 23:00');
            console.log('');
        });
    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

start();

export default app;
