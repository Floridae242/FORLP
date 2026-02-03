// =====================================================
// Kad Kong Ta Smart Insight - Main Server
// Single Zone People Counting + AI Integration
// Version 4.0 - Real AI Data + Real-time Alerts
// =====================================================

import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/index.js';
import { initDatabase } from './db/index.js';
import { peopleCountService } from './services/peopleCountService.js';
import { weatherService } from './services/weatherService.js';
import { dailyReportService } from './services/dailyReportService.js';
import { earlyWarningService } from './services/earlyWarningService.js';
import { 
    authService, 
    ROLES, 
    ROLE_PERMISSIONS,
    authMiddleware,
    officerOnlyMiddleware,
    generateStateToken,
    generateNonce,
    getLineAuthorizationUrl,
    exchangeCodeForToken,
    verifyIdToken,
    saveAuthState,
    getAndRemoveAuthState,
    upsertUser,
    createSession,
    getUserById,
    logoutUser,
    updateUserRole,
    canAccessCCTV
} from './services/authService.js';

const app = express();

// ==================== Middleware ====================
// CORS Configuration สำหรับ Vercel Frontend
const corsOptions = {
    origin: [
        'https://forlp-bams.vercel.app',
        'http://localhost:5173',
        'http://localhost:3000',
        config.frontendUrl
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
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
        version: '4.0.0',
        system: 'Kad Kong Ta - AI People Counter',
        features: ['real-time-alerts', 'rain-forecast', 'crowd-warning'],
        timestamp: new Date().toISOString() 
    });
});

// ==================== LINE LOGIN v2.1 OAUTH 2.0 APIs ====================

// GET /api/auth/line/authorize - เริ่มต้น LINE Login Flow
app.get('/api/auth/line/authorize', (req, res) => {
    try {
        // สร้าง state และ nonce สำหรับป้องกัน CSRF และ Replay Attack
        const state = generateStateToken();
        const nonce = generateNonce();
        
        // บันทึก state และ nonce ไว้ตรวจสอบภายหลัง
        saveAuthState(state, nonce);
        
        // สร้าง LINE Authorization URL
        const authUrl = getLineAuthorizationUrl(state, nonce);
        
        res.json({
            success: true,
            data: {
                authorizationUrl: authUrl,
                state: state
            }
        });
    } catch (error) {
        console.error('[Auth] Authorization URL error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'ไม่สามารถเริ่มต้นการเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง' 
        });
    }
});

// POST /api/auth/line/callback - รับ Authorization Code จาก LINE
app.post('/api/auth/line/callback', async (req, res) => {
    try {
        const { code, state } = req.body;
        
        if (!code || !state) {
            return res.status(400).json({
                success: false,
                error: 'ข้อมูลไม่ครบถ้วน กรุณาลองเข้าสู่ระบบใหม่'
            });
        }
        
        // ตรวจสอบ state เพื่อป้องกัน CSRF
        const authState = getAndRemoveAuthState(state);
        if (!authState) {
            return res.status(400).json({
                success: false,
                error: 'การเชื่อมต่อหมดอายุ กรุณาลองเข้าสู่ระบบใหม่'
            });
        }
        
        // แลก Authorization Code เป็น Access Token
        const tokenResult = await exchangeCodeForToken(code);
        if (!tokenResult.success) {
            return res.status(400).json({
                success: false,
                error: tokenResult.error || 'ไม่สามารถเชื่อมต่อกับ LINE ได้'
            });
        }
        
        // Verify ID Token และดึงข้อมูลผู้ใช้
        const idTokenResult = await verifyIdToken(tokenResult.data.idToken, authState.nonce);
        if (!idTokenResult.success) {
            return res.status(400).json({
                success: false,
                error: idTokenResult.error || 'ไม่สามารถยืนยันตัวตนได้'
            });
        }
        
        const lineUser = idTokenResult.data;
        
        // สร้างหรืออัปเดตผู้ใช้ในระบบ พร้อมบันทึก LINE Tokens
        const user = upsertUser(
            lineUser.userId,
            lineUser.displayName,
            lineUser.pictureUrl,
            {
                accessToken: tokenResult.data.accessToken,
                refreshToken: tokenResult.data.refreshToken,
                expiresIn: tokenResult.data.expiresIn
            }
        );
        
        // สร้าง Session Token สำหรับ Frontend
        const session = createSession(user.id);
        
        // ดึงข้อมูลผู้ใช้แบบเต็ม
        const fullUser = getUserById(user.id);
        
        console.log(`[Auth] LINE Login success: ${lineUser.displayName} (${lineUser.userId})`);
        
        res.json({
            success: true,
            data: {
                user: fullUser,
                session: {
                    token: session.sessionToken,
                    expiresAt: session.expiresAt
                }
            }
        });
    } catch (error) {
        console.error('[Auth] LINE callback error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง' 
        });
    }
});

// GET /api/auth/roles - ดึงรายการ Role และสิทธิ์ทั้งหมด
app.get('/api/auth/roles', (req, res) => {
    res.json({
        success: true,
        data: {
            roles: ROLE_PERMISSIONS
        }
    });
});

// POST /api/auth/logout - ออกจากระบบ (Revoke LINE Token)
app.post('/api/auth/logout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const sessionToken = authHeader.substring(7);
            // ลบ session และ revoke LINE token
            await logoutUser(sessionToken);
        }

        res.json({
            success: true,
            message: 'ออกจากระบบสำเร็จ'
        });
    } catch (error) {
        console.error('[Auth] Logout error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการออกจากระบบ' });
    }
});

// GET /api/auth/me - ดึงข้อมูลผู้ใช้ปัจจุบัน
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({
        success: true,
        data: {
            user: req.user
        }
    });
});

// PUT /api/auth/role - เปลี่ยน Role ของผู้ใช้
app.put('/api/auth/role', authMiddleware, (req, res) => {
    try {
        const { role, officerToken } = req.body;

        if (!role) {
            return res.status(400).json({
                success: false,
                error: 'กรุณาเลือกบทบาทที่ต้องการ'
            });
        }

        const result = updateUserRole(req.user.id, role, officerToken);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        // ดึงข้อมูลผู้ใช้ใหม่
        const updatedUser = getUserById(req.user.id);

        res.json({
            success: true,
            data: {
                user: updatedUser,
                message: `เปลี่ยนบทบาทเป็น "${ROLE_PERMISSIONS[role].label}" สำเร็จ`
            }
        });
    } catch (error) {
        console.error('[Auth] Role update error:', error);
        res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการเปลี่ยนบทบาท' });
    }
});

// GET /api/auth/check-cctv - ตรวจสอบสิทธิ์เข้าถึง CCTV
app.get('/api/auth/check-cctv', authMiddleware, (req, res) => {
    const hasAccess = canAccessCCTV(req.user);

    res.json({
        success: true,
        data: {
            canAccess: hasAccess,
            reason: hasAccess 
                ? 'คุณมีสิทธิ์เข้าถึงกล้องวงจรปิด' 
                : 'เฉพาะเจ้าหน้าที่ที่ได้รับอนุญาตเท่านั้นที่สามารถเข้าถึงกล้องวงจรปิด'
        }
    });
});

// ==================== PROTECTED CCTV API ====================

// GET /api/cctv/streams - ดึงรายการกล้อง (เจ้าหน้าที่เท่านั้น)
app.get('/api/cctv/streams', authMiddleware, officerOnlyMiddleware, (req, res) => {
    // สำหรับ demo - ส่งรายการกล้องจำลอง
    res.json({
        success: true,
        data: {
            cameras: [
                { id: 'cam-1', name: 'กล้อง A', location: 'โซน A', status: 'online' },
                { id: 'cam-2', name: 'กล้อง B', location: 'โซน B', status: 'online' },
                { id: 'cam-3', name: 'กล้อง C', location: 'โซน C', status: 'online' }
            ]
        }
    });
});

// ==================== CAMERA API FOR AI SERVICE ====================

// กำหนดข้อมูลกล้อง
const CAMERAS = [
    { 
        id: 1, 
        name: 'ทางเข้าหลัก', 
        zone: 'โซน A',
        channel: '301',
        status: 'online',
        rtsp_url: 'rtsp://admin:P1r@m1dnvrLpg@10.0.10.3:554/Streaming/Channels/301',
        webrtc_url: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F301'
    },
    { 
        id: 2, 
        name: 'บริเวณกลาง', 
        zone: 'โซน B',
        channel: '201',
        status: 'online',
        rtsp_url: 'rtsp://admin:P1r@m1dnvrLpg@10.0.10.3:554/Streaming/Channels/201',
        webrtc_url: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F201'
    },
    { 
        id: 3, 
        name: 'ทางออก', 
        zone: 'โซน C',
        channel: '501',
        status: 'online',
        rtsp_url: 'rtsp://admin:P1r@m1dnvrLpg@10.0.10.3:554/Streaming/Channels/501',
        webrtc_url: 'https://iocpiramid.com:8085/webrtc.html?src=rtsp%3A%2F%2Fadmin%3AP1r%40m1dnvrLpg%4010.0.10.3%3A554%2FStreaming%2FChannels%2F501'
    }
];

// API Key สำหรับ AI Service (ควรเก็บใน Environment Variable)
const AI_API_KEY = process.env.AI_API_KEY || 'kadkongta-ai-secret-2024';

// Middleware ตรวจสอบ API Key สำหรับ AI Service
const aiAuthMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey || apiKey !== AI_API_KEY) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or missing API key'
        });
    }
    next();
};

// GET /api/ai/cameras - ดึงรายการกล้องทั้งหมดสำหรับ AI Service
app.get('/api/ai/cameras', aiAuthMiddleware, (req, res) => {
    // ส่งข้อมูลกล้องพร้อม RTSP URL
    res.json({
        success: true,
        data: {
            cameras: CAMERAS.map(cam => ({
                id: cam.id,
                name: cam.name,
                zone: cam.zone,
                channel: cam.channel,
                status: cam.status,
                rtsp_url: cam.rtsp_url
            })),
            total: CAMERAS.length
        }
    });
});

// GET /api/ai/cameras/:id - ดึงข้อมูลกล้องเฉพาะตัว
app.get('/api/ai/cameras/:id', aiAuthMiddleware, (req, res) => {
    const cameraId = parseInt(req.params.id);
    const camera = CAMERAS.find(c => c.id === cameraId);
    
    if (!camera) {
        return res.status(404).json({
            success: false,
            error: 'Camera not found'
        });
    }
    
    res.json({
        success: true,
        data: {
            id: camera.id,
            name: camera.name,
            zone: camera.zone,
            channel: camera.channel,
            status: camera.status,
            rtsp_url: camera.rtsp_url
        }
    });
});

// GET /api/ai/cameras/:id/stream-url - ดึง Stream URL สำหรับกล้องเฉพาะตัว
app.get('/api/ai/cameras/:id/stream-url', aiAuthMiddleware, (req, res) => {
    const cameraId = parseInt(req.params.id);
    const camera = CAMERAS.find(c => c.id === cameraId);
    
    if (!camera) {
        return res.status(404).json({
            success: false,
            error: 'Camera not found'
        });
    }
    
    res.json({
        success: true,
        data: {
            camera_id: camera.id,
            camera_name: camera.name,
            rtsp_url: camera.rtsp_url,
            protocol: 'rtsp',
            resolution: '1920x1080',
            fps: 25
        }
    });
});

// POST /api/ai/people-count - รับข้อมูลจำนวนคนจาก AI Service (รองรับทั้ง Realtime และ Playback Mode)
app.post('/api/ai/people-count', aiAuthMiddleware, (req, res) => {
    const { 
        camera_id, 
        count,           // Realtime mode
        timestamp, 
        confidence, 
        detections,
        // Playback mode fields
        window_start,
        window_end,
        max_people,
        avg_people,
        min_people,
        frames_processed,
        sampling_fps,
        source_type
    } = req.body;
    
    // ตรวจสอบว่าเป็น Playback Mode หรือ Realtime Mode
    const isPlaybackMode = source_type === 'playback' || (max_people !== undefined && window_start);
    
    if (isPlaybackMode) {
        // === PLAYBACK MODE ===
        // รับข้อมูลจากการวิเคราะห์วิดีโอย้อนหลัง
        
        if (typeof max_people !== 'number' || max_people < 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid max_people value for playback mode'
            });
        }
        
        // บันทึก max_people เป็น count หลัก (เพื่อใช้ใน dashboard)
        const result = peopleCountService.ingestPeopleCount(max_people, timestamp || new Date().toISOString());
        
        // Log สำหรับ debug
        console.log(`[AI Playback] Camera ${camera_id || 'unknown'}:`);
        console.log(`   Window: ${window_start} → ${window_end}`);
        console.log(`   Max: ${max_people} | Avg: ${avg_people?.toFixed(1) || 'N/A'} | Min: ${min_people || 'N/A'}`);
        console.log(`   Frames: ${frames_processed || 'N/A'} @ ${sampling_fps || 1} fps`);
        
        res.json({
            success: true,
            data: {
                received: true,
                mode: 'playback',
                camera_id: camera_id,
                window_start: window_start,
                window_end: window_end,
                max_people: max_people,
                avg_people: avg_people,
                min_people: min_people,
                frames_processed: frames_processed,
                timestamp: result.timestamp
            }
        });
        
    } else {
        // === REALTIME MODE ===
        // รับข้อมูลแบบเดิม (single count per request)
        
        if (typeof count !== 'number' || count < 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid count value'
            });
        }
        
        // บันทึกข้อมูล
        const result = peopleCountService.ingestPeopleCount(count, timestamp);
        
        // Log สำหรับ debug
        console.log(`[AI Realtime] Camera ${camera_id || 'unknown'}: ${count} people (confidence: ${confidence || 'N/A'})`);
        
        res.json({
            success: true,
            data: {
                received: true,
                mode: 'realtime',
                camera_id: camera_id,
                count: count,
                timestamp: result.timestamp
            }
        });
    }
});

// POST /api/ai/people-count/batch - รับข้อมูลจำนวนคนจากหลายกล้องพร้อมกัน
app.post('/api/ai/people-count/batch', aiAuthMiddleware, (req, res) => {
    const { counts } = req.body;
    
    if (!Array.isArray(counts)) {
        return res.status(400).json({
            success: false,
            error: 'counts must be an array'
        });
    }
    
    let totalCount = 0;
    const results = [];
    
    for (const item of counts) {
        const { camera_id, count, timestamp, confidence } = item;
        
        if (typeof count === 'number' && count >= 0) {
            totalCount += count;
            results.push({
                camera_id,
                count,
                status: 'received'
            });
            console.log(`[AI Batch] Camera ${camera_id}: ${count} people`);
        }
    }
    
    // บันทึกจำนวนรวม
    const result = peopleCountService.ingestPeopleCount(totalCount, new Date().toISOString());
    
    res.json({
        success: true,
        data: {
            total_count: totalCount,
            cameras_processed: results.length,
            results: results,
            timestamp: result.timestamp
        }
    });
});

// GET /api/ai/config - ดึง Configuration สำหรับ AI Service
app.get('/api/ai/config', aiAuthMiddleware, (req, res) => {
    res.json({
        success: true,
        data: {
            ingest_endpoint: '/api/ai/people-count',
            batch_endpoint: '/api/ai/people-count/batch',
            cameras_endpoint: '/api/ai/cameras',
            polling_interval_seconds: 5,
            model_recommended: 'yolov8n',
            detection_class: 0,  // person class in COCO
            confidence_threshold: 0.5,
            nms_threshold: 0.4
        }
    });
});

// ==================== PEOPLE COUNT APIs (Updated per PROMPT) ====================

// GET /api/people/current - จำนวนคนปัจจุบัน (Real-time from AI)
app.get('/api/people/current', (req, res) => {
    const data = peopleCountService.getCurrentCount();
    
    res.json({
        success: true,
        data: {
            count: data.count,
            smoothed_count: data.smoothed_count,
            status: data.status,
            status_label: data.status_label,
            timestamp: data.timestamp,
            source: data.source,
            source_latency_s: data.source_latency_s,
            is_stale: data.is_stale,
            camera_count: data.camera_count
        }
    });
});

// GET /api/people/daily - สรุปรายวัน (ตาม PROMPT)
app.get('/api/people/daily', (req, res) => {
    const { date } = req.query;
    const summary = peopleCountService.getDailySummary(date);
    
    res.json({
        success: true,
        data: summary
    });
});

// POST /api/people/ingest - รับข้อมูลจาก AI Service (ตาม PROMPT spec)
app.post('/api/people/ingest', (req, res) => {
    const {
        stream_id,
        timestamp,
        people_count,
        smoothed_count,
        max_count,
        avg_count,
        frames_processed,
        source_type,
        confidence
    } = req.body;
    
    // Validate required fields
    if (typeof people_count !== 'number' || people_count < 0) {
        return res.status(400).json({
            success: false,
            error: 'Invalid people_count value'
        });
    }
    
    // Ingest data
    const result = peopleCountService.ingestPeopleCount({
        stream_id: stream_id || 'unknown',
        timestamp: timestamp || new Date().toISOString(),
        people_count,
        smoothed_count,
        max_count,
        avg_count,
        frames_processed,
        source_type: source_type || 'playback',
        confidence
    });
    
    // Trigger crowd check after ingest (real-time alerts)
    earlyWarningService.processCrowdCheck().catch(err => {
        console.error('[Ingest] Crowd check error:', err.message);
    });
    
    res.json({
        success: true,
        data: result.data
    });
});

// GET /api/people/stats - สถิติล่าสุด (สำหรับ Dashboard)
app.get('/api/people/stats', (req, res) => {
    const stats = peopleCountService.getLatestStats();
    
    res.json({
        success: true,
        data: stats
    });
});

// GET /api/people/cameras - ข้อมูลทุกกล้อง
app.get('/api/people/cameras', (req, res) => {
    const cameras = peopleCountService.getAllCamerasData();
    
    res.json({
        success: true,
        data: cameras
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

// GET /api/people/crowd-level - ระดับความแออัดปัจจุบัน
app.get('/api/people/crowd-level', (req, res) => {
    const crowdLevel = peopleCountService.checkCrowdLevel();
    
    res.json({
        success: true,
        data: crowdLevel
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

// ==================== EARLY WARNING APIs ====================

// GET /api/warnings/rain-check - ตรวจสอบพยากรณ์ฝน
app.get('/api/warnings/rain-check', async (req, res) => {
    try {
        const result = await earlyWarningService.checkRainForecast();
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/warnings/forecast - ดูพยากรณ์อากาศรายชั่วโมง
app.get('/api/warnings/forecast', async (req, res) => {
    try {
        const forecast = await earlyWarningService.getHourlyForecast();
        
        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/warnings/test - ทดสอบส่ง warning (สำหรับ debug)
app.post('/api/warnings/test', async (req, res) => {
    try {
        const { type } = req.body; // 'rain', 'crowd', 'critical', 'daily'
        const result = await earlyWarningService.testSendWarning(type || 'rain');
        
        res.json({
            success: result.success,
            data: result
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
            timestamp: new Date().toISOString(),
            config: {
                lineConfigured: !!config.lineChannelAccessToken,
                lineLoginConfigured: !!config.lineLoginChannelId && !!config.lineLoginChannelSecret,
                weatherConfigured: !!config.openWeatherApiKey
            }
        }
    });
});

// ==================== TEST APIs (Updated) ====================

// GET /api/test/line - ทดสอบส่งข้อความ LINE
app.get('/api/test/line', async (req, res) => {
    try {
        const testMessage = `ทดสอบระบบแจ้งเตือน LINE


ระบบ LINE OA เชื่อมต่อสำเร็จ
📅 ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
🔧 Version 4.0 - Real-time Alerts

Kad Kong Ta Smart Insight`;

        const result = await dailyReportService.sendLineMessage(testMessage);
        
        res.json({
            success: result.success,
            message: result.success ? 'ส่งข้อความทดสอบสำเร็จ' : 'ส่งข้อความไม่สำเร็จ',
            error: result.error || null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/test/rain-warning - ทดสอบส่ง Rain Warning
app.get('/api/test/rain-warning', async (req, res) => {
    try {
        const result = await earlyWarningService.testSendWarning('rain');
        
        res.json({
            success: result.success,
            message: result.success ? 'ส่ง Rain Warning สำเร็จ' : 'ส่งไม่สำเร็จ',
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/test/crowd-warning - ทดสอบส่ง Crowd Warning
app.get('/api/test/crowd-warning', async (req, res) => {
    try {
        const result = await earlyWarningService.testSendWarning('crowd');
        
        res.json({
            success: result.success,
            message: result.success ? 'ส่ง Crowd Warning สำเร็จ' : 'ส่งไม่สำเร็จ',
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/test/crowd-critical - ทดสอบส่ง Crowd Critical Alert
app.get('/api/test/crowd-critical', async (req, res) => {
    try {
        const result = await earlyWarningService.testSendWarning('critical');
        
        res.json({
            success: result.success,
            message: result.success ? 'ส่ง Critical Alert สำเร็จ' : 'ส่งไม่สำเร็จ',
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/test/daily-report - ทดสอบส่ง Daily Report
app.get('/api/test/daily-report', async (req, res) => {
    try {
        const result = await earlyWarningService.testSendWarning('daily');
        
        res.json({
            success: result.success,
            message: result.success ? 'ส่ง Daily Report สำเร็จ' : 'ส่งไม่สำเร็จ',
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/test/forecast - ดูข้อมูลพยากรณ์อากาศ
app.get('/api/test/forecast', async (req, res) => {
    try {
        const forecast = await earlyWarningService.getForecastSummary();
        
        res.json({
            success: true,
            data: forecast
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 404 Handler ====================
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// ==================== SCHEDULERS (Updated per PROMPT) ====================

/**
 * Rain Check Scheduler - ตรวจสอบพยากรณ์ฝนทุก 10 นาที
 */
let rainCheckInterval = null;

function startRainCheckScheduler() {
    const interval = 10 * 60 * 1000; // 10 นาที
    
    console.log('[Rain Check] Starting scheduler (every 10 minutes)');
    
    // ตรวจสอบครั้งแรกหลัง 1 นาที (รอ server พร้อม)
    setTimeout(() => {
        earlyWarningService.processRainCheck();
    }, 60 * 1000);
    
    // ตั้ง interval
    rainCheckInterval = setInterval(() => {
        earlyWarningService.processRainCheck();
    }, interval);
}

/**
 * LINE Notification Scheduler
 * - Daily Report: เฉพาะวันเสาร์-อาทิตย์ เวลา 23:00 (Asia/Bangkok)
 */
let lineSchedulerInterval = null;

// เก็บสถานะว่าส่งไปแล้วหรือยังในแต่ละวัน
const sentToday = {
    dailyReport: null
};

function startLineScheduler() {
    console.log('[LINE Scheduler] Starting (Daily Report: Sat-Sun 23:00)');
    
    // ตรวจสอบทุก 1 นาที
    lineSchedulerInterval = setInterval(checkAndSendDailyReport, 60 * 1000);
    
    // ตรวจสอบครั้งแรกทันที
    checkAndSendDailyReport();
}

async function checkAndSendDailyReport() {
    // ใช้เวลา Asia/Bangkok
    const nowBangkok = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const today = nowBangkok.toISOString().split('T')[0];
    const hour = nowBangkok.getHours();
    const minute = nowBangkok.getMinutes();
    const dayOfWeek = nowBangkok.getDay(); // 0 = อาทิตย์, 6 = เสาร์
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Daily Report: เฉพาะวันเสาร์-อาทิตย์ เวลา 23:00 (ตาม PROMPT)
    if (isWeekend && hour === 23 && minute === 0 && sentToday.dailyReport !== today) {
        console.log('[LINE Scheduler] Sending Daily Report (Weekend 23:00)...');
        try {
            const result = await earlyWarningService.processDailyReport(today);
            sentToday.dailyReport = today;
            console.log('[LINE Scheduler] Daily Report result:', result.success ? 'Sent' : 'Failed');
        } catch (error) {
            console.error('[LINE Scheduler] Daily Report error:', error.message);
        }
    }
}

/**
 * Setup LINE Message Sender for Early Warning Service
 */
function setupLineSender() {
    // ใช้ dailyReportService.sendLineMessage เป็น sender
    earlyWarningService.setLineMessageSender(async (message) => {
        try {
            const result = await dailyReportService.sendLineMessage(message);
            return result;
        } catch (error) {
            console.error('[LINE Sender] Error:', error.message);
            return { success: false, error: error.message };
        }
    });
    
    console.log('[LINE Sender] Connected to Early Warning Service');
}

/**
 * Setup Alert Callbacks for People Count Service
 */
function setupAlertCallbacks() {
    peopleCountService.setAlertCallbacks({
        onCrowdWarning: async (data) => {
            console.log('[Alert Callback] Crowd Warning triggered');
            await earlyWarningService.sendCrowdWarning(data);
        },
        onCrowdCritical: async (data) => {
            console.log('[Alert Callback] Crowd Critical triggered');
            await earlyWarningService.sendCrowdCritical(data);
        }
    });
    
    console.log('[Alert Callbacks] Connected to People Count Service');
}

// ==================== Start Server ====================
async function start() {
    console.log('');
    console.log('Kad Kong Ta - AI People Counter v4.0');
    console.log('');
    console.log('Features: Real-time Alerts, Rain Forecast, Crowd Warning');
    console.log('');
    
    try {
        console.log('Validating configuration...');
        validateConfig();

        console.log('Initializing database...');
        await initDatabase();

        console.log('Setting up LINE sender...');
        setupLineSender();
        
        console.log('Setting up alert callbacks...');
        setupAlertCallbacks();

        console.log('Starting rain check scheduler (every 10 min)...');
        startRainCheckScheduler();
        
        console.log('Starting LINE notification scheduler...');
        startLineScheduler();

        app.listen(config.port, () => {
            console.log('');
            console.log(`🚀 Server: http://localhost:${config.port}`);
            console.log('');
            console.log('API Endpoints:');
            console.log('   GET  /api/people/current      - จำนวนคนปัจจุบัน (real-time)');
            console.log('   GET  /api/people/daily        - สรุปรายวัน');
            console.log('   POST /api/people/ingest       - รับข้อมูลจาก AI Service');
            console.log('   GET  /api/people/crowd-level  - ระดับความแออัด');
            console.log('   GET  /api/warnings/rain-check - ตรวจสอบพยากรณ์ฝน');
            console.log('');
            console.log('Scheduled Tasks:');
            console.log('   Rain Check      - ทุก 10 นาที');
            console.log('   Crowd Alerts    - Real-time (>= 300 warning, >= 600 critical)');
            console.log('   Daily Report    - เสาร์-อาทิตย์ 23:00 (Asia/Bangkok)');
            console.log('');
            console.log('Test Endpoints:');
            console.log('   GET /api/test/rain-warning    - ทดสอบแจ้งเตือนฝน');
            console.log('   GET /api/test/crowd-warning   - ทดสอบแจ้งเตือนความแออัด');
            console.log('   GET /api/test/crowd-critical  - ทดสอบแจ้งเตือนฉุกเฉิน');
            console.log('   GET /api/test/daily-report    - ทดสอบส่งรายงานประจำวัน');
            console.log('');
        });
    } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

start();

export default app;
