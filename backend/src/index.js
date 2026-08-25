// =====================================================
// Kad Kong Ta Smart Insight - Main Server
// Single Zone People Counting + AI Integration
// Version 4.0 - Real AI Data + Real-time Alerts
// =====================================================

import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/index.js';
import { initDatabase, queries, query, queryOne } from './db/index.js';
import {
    setupGlobalErrorHandlers,
    ErrorLogger,
    expressAsyncHandler,
    normalizeError,
    ValidationError,
    ExternalServiceError,
    formatErrorResponse
} from './utils/errorHandling.js';
import { peopleCountService } from './services/peopleCountService.js';
import { zoneStatusFromCount } from './services/zoneStatus.js';
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
    canAccessCCTV,
    updateUserRole
} from './services/authService.js';
import {
    rateLimitMiddleware,
    sanitizeInputs,
    validateAiApiKey,
    isValidOfficerToken,
    validatePeopleCountRequest,
    validateOfficerTokenRequest,
    validateLineCallbackRequest,
    errorHandler,
    notFoundHandler,
    securityHeadersMiddleware
} from './middleware/index.js';
import { fetchCctvStatus, isIocConfigured } from './services/iocService.js';

// ==================== SETUP ERROR HANDLING ====================
// Global error handlers for unhandled rejections and exceptions
setupGlobalErrorHandlers();

// Error logger instance
const errorLogger = new ErrorLogger('./logs');

const app = express();

// Trust Render's reverse proxy (required for express-rate-limit behind proxy)
app.set('trust proxy', 1);

// ==================== Middleware ====================
// Security Headers
app.use(securityHeadersMiddleware);

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
};

app.use(cors(corsOptions));

// Rate Limiting (ใช้ก่อน JSON parsing เพื่อป้องกัน DOS)
app.use(rateLimitMiddleware);

// Per-request timeout — prevents a hung Supabase call from pinning a worker
app.use((req, res, next) => {
    res.setTimeout(30_000, () => {
        if (!res.headersSent) {
            res.status(503).json({ success: false, error: 'Request timeout' });
        }
    });
    next();
});

// JSON Parsing (1 MB limit)
app.use(express.json({ limit: '1mb' }));

// Input Sanitization
app.use(sanitizeInputs);

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
        const user = await upsertUser(
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
        const session = await createSession(user.id);

        // ดึงข้อมูลผู้ใช้แบบเต็ม
        const fullUser = await getUserById(user.id);

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

// POST /api/auth/verify-officer - ยืนยันรหัสเจ้าหน้าที่
app.post('/api/auth/verify-officer', authMiddleware, async (req, res) => {
    try {
        const { officerToken } = req.body;

        if (!officerToken || typeof officerToken !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'กรุณากรอกรหัสสำหรับเจ้าหน้าที่'
            });
        }

        const result = await updateUserRole(req.user.id, ROLES.OFFICER, officerToken.trim());

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        // ดึงข้อมูลผู้ใช้ที่อัปเดตแล้ว
        const updatedUser = await getUserById(req.user.id);

        console.log(`[Auth] Officer verified: ${req.user.displayName} (${req.user.lineUserId})`);

        res.json({
            success: true,
            message: 'ยืนยันตัวตนเจ้าหน้าที่สำเร็จ',
            data: {
                user: updatedUser
            }
        });
    } catch (error) {
        console.error('[Auth] Verify officer error:', error);
        res.status(500).json({
            success: false,
            error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
        });
    }
});

// ==================== PROTECTED CCTV API ====================

// GET /api/cctv/streams - ดึงรายการกล้อง (เจ้าหน้าที่เท่านั้น)
app.get('/api/cctv/streams', authMiddleware, officerOnlyMiddleware, (req, res) => {
    res.json({
        success: true,
        data: {
            cameras: CAMERAS.map(({ id, ioc_code, name, zone, channel, status, webrtc_url }) =>
                ({ id, ioc_code, name, zone, channel, status, webrtc_url }))
        }
    });
});

// POST /api/cctv/playback-url — สร้าง playback URL ฝั่ง server โดยไม่เปิดเผย credentials ให้ frontend
app.post('/api/cctv/playback-url', authMiddleware, officerOnlyMiddleware, (req, res) => {
    const { cameraId, startTime, endTime } = req.body;
    const camera = findCamera(cameraId);

    if (!camera) {
        return res.status(404).json({ success: false, error: 'Camera not found' });
    }

    const { nvrUser, nvrPass, webrtcBaseUrl } = config;
    if (!webrtcBaseUrl || !nvrUser) {
        return res.status(503).json({ success: false, error: 'Camera credentials not configured' });
    }

    if (!startTime || !endTime || isNaN(new Date(startTime).getTime()) || isNaN(new Date(endTime).getTime())) {
        return res.status(400).json({ success: false, error: 'startTime and endTime must be valid ISO strings' });
    }

    const formatDt = (iso) => {
        const d = new Date(iso);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}t${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}z`;
    };

    const u = encodeURIComponent(nvrUser);
    const p = encodeURIComponent(nvrPass);
    const start = formatDt(startTime);
    const end = formatDt(endTime);
    const webrtc_url = `${webrtcBaseUrl}/webrtc.html?src=rtsp%3A%2F%2F${u}%3A${p}%40${camera.host}%3A554%2FStreaming%2Ftracks%2F${camera.channel}%3Fstarttime%3D${start}%26endtime%3D${end}`;

    res.json({ success: true, data: { webrtc_url } });
});

// ==================== ZONE ESTIMATES API ====================

const ZONE_NAMES = { A: 'ถนนคนเดิน', B: 'สะพานรัษฎา', C: 'ตลาดเก่า' };

async function buildZoneResponse() {
    const current = peopleCountService.getCurrentCount();
    const total = current?.smoothed_count ?? current?.count ?? 0;
    const rows = await queries.getZoneEstimates();

    const zones = rows.map((row) => {
        const estimated_count = total > 0
            ? Math.round((row.percentage / 100) * total)
            : null;
        return {
            zone_code: row.zone_code,
            name: ZONE_NAMES[row.zone_code] || row.zone_code,
            percentage: row.percentage,
            estimated_count,
            ...zoneStatusFromCount(estimated_count ?? 0),
        };
    });

    const lastRow = rows.find((r) => r.updated_at);
    return {
        total_people: total,
        updated_by: lastRow?.updated_by ?? null,
        updated_at: lastRow?.updated_at ?? null,
        zones,
    };
}

// GET /api/zones/current — สัดส่วนผู้คนในแต่ละโซน (public)
app.get('/api/zones/current', async (req, res) => {
    try {
        res.json({ success: true, data: await buildZoneResponse() });
    } catch (err) {
        res.status(500).json({ success: false, error: 'ไม่สามารถโหลดข้อมูลโซนได้' });
    }
});

// POST /api/zones/update — อัปเดตสัดส่วนโซน (officer only)
app.post('/api/zones/update', authMiddleware, officerOnlyMiddleware, async (req, res) => {
    const { A, B, C } = req.body;

    if (
        typeof A !== 'number' || typeof B !== 'number' || typeof C !== 'number' ||
        !Number.isFinite(A) || !Number.isFinite(B) || !Number.isFinite(C) ||
        A < 0 || A > 100 || B < 0 || B > 100 || C < 0 || C > 100
    ) {
        return res.status(400).json({
            success: false,
            error: 'A, B, C ต้องเป็นตัวเลขระหว่าง 0–100',
        });
    }

    const sum = A + B + C;
    if (Math.abs(sum - 100) > 0.5) {
        return res.status(400).json({
            success: false,
            error: `สัดส่วนรวมต้องเท่ากับ 100 (ได้รับ ${sum.toFixed(1)})`,
        });
    }

    const updatedBy = req.user?.displayName || req.user?.userId || 'เจ้าหน้าที่';

    try {
        await queries.updateZoneEstimates({ A, B, C }, updatedBy);
        res.json({ success: true, data: await buildZoneResponse() });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
        });
    }
});

// ==================== CAMERA API FOR AI SERVICE ====================

// สร้างข้อมูลกล้องจาก environment variables — credentials ไม่ถูก hardcode ในโค้ด
function buildCameras() {
    const { nvrHostA, nvrHostB, nvrUser, nvrPass, webrtcBaseUrl } = config;
    const u = encodeURIComponent(nvrUser);
    const p = encodeURIComponent(nvrPass);

    const makeRtsp = (host, channel) =>
        nvrUser ? `rtsp://${nvrUser}:${nvrPass}@${host}:554/Streaming/Channels/${channel}` : '';
    const makeWebrtc = (host, channel) =>
        webrtcBaseUrl ? `${webrtcBaseUrl}/webrtc.html?src=rtsp%3A%2F%2F${u}%3A${p}%40${host}%3A554%2FStreaming%2FChannels%2F${channel}` : '';
    const makePlaybackWebrtc = (host, track, start, end) =>
        webrtcBaseUrl ? `${webrtcBaseUrl}/webrtc.html?src=rtsp%3A%2F%2F${u}%3A${p}%40${host}%3A554%2FStreaming%2Ftracks%2F${track}%3Fstarttime%3D${start}%26endtime%3D${end}` : '';

    return [
        { id: 1, ioc_code: 'LPG-A01-CC-01', name: 'ตลาดกาดกองต้า (PTZ) (Face Rec.)', zone: 'โซน A', channel: '201', host: nvrHostB, status: 'online',
          rtsp_url: makeRtsp(nvrHostB, '201'), webrtc_url: makeWebrtc(nvrHostB, '201') },
        { id: 2, ioc_code: 'LPG-A01-CC-02', name: 'ตลาดกาดกองต้า', zone: 'โซน A', channel: '201', host: nvrHostA, status: 'online',
          rtsp_url: makeRtsp(nvrHostA, '201'), webrtc_url: makeWebrtc(nvrHostA, '201') },
        { id: 3, ioc_code: 'LPG-B01-CC-01', name: 'ตลาดกาดกองต้า 1 ฝั่งสะพานรัษฎา', zone: 'โซน B', channel: '301', host: nvrHostA, status: 'online',
          rtsp_url: makeRtsp(nvrHostA, '301'), webrtc_url: makeWebrtc(nvrHostA, '301') },
        { id: 4, ioc_code: 'LPG-B01-CC-02', name: 'ตลาดกาดกองต้า 1 ฝั่งสะพานรัษฎา (PTZ) (Face Rec.)', zone: 'โซน B', channel: '401', host: nvrHostB, status: 'online',
          rtsp_url: makeRtsp(nvrHostB, '401'), webrtc_url: makeWebrtc(nvrHostB, '401') },
        { id: 5, ioc_code: 'LPG-B02-CC-01', name: 'ตลาดกาดกองต้า 2 ตลาดเก่า', zone: 'โซน B', channel: '501', host: nvrHostA, status: 'online',
          rtsp_url: makeRtsp(nvrHostA, '501'), webrtc_url: makeWebrtc(nvrHostA, '501') },
        { id: 6, ioc_code: 'LPG-B02-CC-02', name: 'ตลาดกาดกองต้า 2 ตลาดเก่า', zone: 'โซน B', channel: '601', host: nvrHostA, status: 'online',
          rtsp_url: makeRtsp(nvrHostA, '601'), webrtc_url: makeWebrtc(nvrHostA, '601') },
    ];
}
const CAMERAS = buildCameras();

function findCamera(cameraId) {
    const value = String(cameraId ?? '').trim();
    return CAMERAS.find((camera) => String(camera.id) === value || camera.ioc_code === value);
}

// อัปเดตสถานะกล้องจริงจาก Lampang IOC (online/offline) แทนค่า default 'online'
// จับคู่ด้วยรหัสกล้อง IOC ที่กำหนดแยกจากชื่อกล้อง
const CAMERA_STATUS_REFRESH_MS = 60 * 1000;

async function refreshCameraStatus() {
    if (!isIocConfigured()) return; // ไม่ตั้งค่า IOC — คงสถานะเดิมไว้
    try {
        const statusByCode = await fetchCctvStatus();
        let updated = 0;
        for (const cam of CAMERAS) {
            const status = statusByCode.get(cam.ioc_code);
            if (status && status !== cam.status) {
                cam.status = status;
                updated++;
            } else if (status) {
                cam.status = status;
            }
        }
        if (updated > 0) {
            console.log(`[IOC] Camera status refreshed (${updated} changed)`);
        }
    } catch (err) {
        // IOC ใช้ไม่ได้ชั่วคราว — คงสถานะล่าสุดไว้ ไม่ทำให้ระบบล่ม
        console.warn('[IOC] Camera status refresh failed:', err.message);
    }
}

// ไม่รันใน test (vitest ตั้ง NODE_ENV=test) เพื่อไม่ให้ยิง IOC จริง/ค้าง interval
if (process.env.NODE_ENV !== 'test') {
    if (isIocConfigured()) {
        refreshCameraStatus();
        setInterval(refreshCameraStatus, CAMERA_STATUS_REFRESH_MS);
    } else {
        console.warn('[IOC] IOC_USERNAME/IOC_PASSWORD not set — camera status stays default');
    }
}

// API Key สำหรับ AI Service — ต้องตั้งค่า AI_API_KEY ใน environment variables
const AI_API_KEY = config.aiApiKey;

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
                ioc_code: cam.ioc_code,
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
    const camera = findCamera(req.params.id);

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
            ioc_code: camera.ioc_code,
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
    const camera = findCamera(req.params.id);

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
            ioc_code: camera.ioc_code,
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
app.get('/api/people/daily', async (req, res) => {
    const { date } = req.query;
    const summary = await peopleCountService.getDailySummary(date);

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
app.get('/api/people/stats', async (req, res) => {
    const stats = await peopleCountService.getLatestStats();

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
app.get('/api/people/history', async (req, res) => {
    const days = parseInt(req.query.days) || 7;
    const history = await peopleCountService.getHistoricalData(days);

    res.json({
        success: true,
        data: history,
        count: history.length
    });
});

// GET /api/people/hourly - ข้อมูลรายชั่วโมง
app.get('/api/people/hourly', async (req, res) => {
    const { date } = req.query;
    const hourly = await peopleCountService.getHourlyData(date);

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
app.get('/api/reports/daily', async (req, res) => {
    try {
        const { date } = req.query;
        const [summary, hourly] = await Promise.all([
            peopleCountService.getDailySummary(date),
            peopleCountService.getHourlyData(date),
        ]);

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

// GET /api/reports/weekly - รายงานรายสัปดาห์ (เฉพาะวันเสาร์-อาทิตย์ ช่วงเวลา 16:00-22:00 เวลาไทย)
app.get('/api/reports/weekly', async (req, res) => {
    try {
        // ดึงข้อมูลย้อนหลัง 30 วัน เฉพาะช่วงเวลาที่ตลาดเปิด (16:00-22:00 เวลาไทย)
        const allHistory = await peopleCountService.getHistoricalDataMarketHours(30);

        // Filter เฉพาะวันเสาร์ (6) และอาทิตย์ (0)
        const weekendHistory = allHistory.filter(day => {
            const date = new Date(day.date);
            const dayOfWeek = date.getDay();
            return dayOfWeek === 0 || dayOfWeek === 6; // 0 = อาทิตย์, 6 = เสาร์
        });

        // จัดกลุ่มเป็นสัปดาห์ (เสาร์-อาทิตย์ คู่กัน)
        const weeks = [];
        let currentWeek = null;

        weekendHistory.forEach(day => {
            const date = new Date(day.date);
            const dayOfWeek = date.getDay();

            // หา week number (ISO week)
            const startOfYear = new Date(date.getFullYear(), 0, 1);
            const weekNumber = Math.ceil((((date - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
            const weekKey = `${date.getFullYear()}-W${weekNumber}`;

            if (!currentWeek || currentWeek.weekKey !== weekKey) {
                currentWeek = {
                    weekKey,
                    weekNumber,
                    year: date.getFullYear(),
                    days: [],
                    saturday: null,
                    sunday: null
                };
                weeks.push(currentWeek);
            }

            currentWeek.days.push(day);
            if (dayOfWeek === 6) currentWeek.saturday = day;
            if (dayOfWeek === 0) currentWeek.sunday = day;
        });

        // คำนวณสรุปแต่ละสัปดาห์
        const weeklySummaries = weeks.map(week => {
            const totalDays = week.days.length;
            const maxPeople = totalDays > 0 ? Math.max(...week.days.map(d => d.max_people || 0)) : 0;
            const avgPeople = totalDays > 0
                ? Math.round(week.days.reduce((sum, d) => sum + (d.avg_people || 0), 0) / totalDays)
                : 0;
            const totalSamples = week.days.reduce((sum, d) => sum + (d.total_samples || 0), 0);

            // หาช่วงวันที่
            const dates = week.days.map(d => new Date(d.date)).sort((a, b) => a - b);
            const startDate = dates.length > 0 ? dates[0].toISOString().split('T')[0] : null;
            const endDate = dates.length > 0 ? dates[dates.length - 1].toISOString().split('T')[0] : null;

            return {
                week_key: week.weekKey,
                week_number: week.weekNumber,
                year: week.year,
                start_date: startDate,
                end_date: endDate,
                days_open: totalDays,
                max_people: maxPeople,
                avg_people: avgPeople,
                total_samples: totalSamples,
                market_hours: '16:00-22:00',
                saturday: week.saturday ? {
                    date: week.saturday.date,
                    max_people: week.saturday.max_people || 0,
                    avg_people: week.saturday.avg_people || 0
                } : null,
                sunday: week.sunday ? {
                    date: week.sunday.date,
                    max_people: week.sunday.max_people || 0,
                    avg_people: week.sunday.avg_people || 0
                } : null,
                daily: week.days
            };
        });

        // สรุปรวมทั้งหมด
        const overallSummary = {
            total_weeks: weeklySummaries.length,
            total_days: weekendHistory.length,
            max_people_ever: weekendHistory.length > 0 ? Math.max(...weekendHistory.map(d => d.max_people || 0)) : 0,
            avg_people_overall: weekendHistory.length > 0
                ? Math.round(weekendHistory.reduce((sum, d) => sum + (d.avg_people || 0), 0) / weekendHistory.length)
                : 0,
            market_hours: '16:00-22:00',
            note: 'ข้อมูลนับเฉพาะช่วงเวลาที่ตลาดเปิด (16:00-22:00 น.)'
        };

        res.json({
            success: true,
            data: {
                summary: overallSummary,
                weeks: weeklySummaries,
                all_weekend_days: weekendHistory
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/reports/history - ประวัติรายงาน
app.get('/api/reports/history', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const history = await peopleCountService.getHistoricalData(days);

        res.json({
            success: true,
            data: history,
            count: history.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== MONTHLY / COMPARE REPORTS (งบประมาณ) ====================

/**
 * แปลงพารามิเตอร์เดือน (YYYY-MM) เป็นช่วงวันที่ start/end
 * คืนค่า null ถ้ารูปแบบไม่ถูกต้อง; ถ้าไม่ส่งมาจะใช้เดือนปัจจุบัน
 */
function resolveMonthRange(monthParam) {
    let year, monthIdx;
    if (monthParam) {
        const m = /^(\d{4})-(\d{2})$/.exec(monthParam);
        if (!m) return null;
        year = parseInt(m[1], 10);
        monthIdx = parseInt(m[2], 10) - 1;
        if (monthIdx < 0 || monthIdx > 11) return null;
    } else {
        const now = new Date();
        year = now.getFullYear();
        monthIdx = now.getMonth();
    }
    const pad = (n) => String(n).padStart(2, '0');
    const monthNum = pad(monthIdx + 1);
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    return {
        month: `${year}-${monthNum}`,
        start: `${year}-${monthNum}-01`,
        end: `${year}-${monthNum}-${pad(lastDay)}`
    };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * สรุปจุดเสี่ยงที่แจ้งเข้ามาในช่วงเวลา (แยกตามสถานะ)
 */
async function getSafetyReportsSummary(startDate, endDate) {
    try {
        const row = await queryOne(
            `SELECT COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                    COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
                    COUNT(*) FILTER (WHERE status = 'rejected') as rejected
             FROM safety_reports
             WHERE created_at::date >= $1::date AND created_at::date <= $2::date`,
            [startDate, endDate]
        );
        return row || { total: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0 };
    } catch (error) {
        console.error('[Reports] Safety summary error:', error.message);
        return { total: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0 };
    }
}

/**
 * สรุปจุดเสี่ยงแยกตามประเภทปัญหา
 */
async function getSafetyReportsByType(startDate, endDate) {
    try {
        return await query(
            `SELECT issue_type, COUNT(*) as count
             FROM safety_reports
             WHERE created_at::date >= $1::date AND created_at::date <= $2::date
             GROUP BY issue_type
             ORDER BY count DESC`,
            [startDate, endDate]
        );
    } catch (error) {
        console.error('[Reports] Safety by-type error:', error.message);
        return [];
    }
}

/**
 * สรุปจำนวน crowd alerts ในช่วงเวลา (ใช้ดูความถี่การแจ้งเตือนสำหรับวางแผนกำลังคน)
 */
async function getCrowdAlertsSummary(startDate, endDate) {
    try {
        const rows = await query(
            `SELECT alert_level, COUNT(*) as count
             FROM crowd_alerts
             WHERE created_at::date >= $1::date AND created_at::date <= $2::date
             GROUP BY alert_level`,
            [startDate, endDate]
        );
        const byLevel = {};
        let total = 0;
        for (const r of rows) {
            byLevel[r.alert_level] = r.count;
            total += r.count;
        }
        return { total, by_level: byLevel };
    } catch (error) {
        console.error('[Reports] Crowd alerts summary error:', error.message);
        return { total: 0, by_level: {} };
    }
}

/**
 * รวมรายงานของช่วงเวลาเดียว (คน + จุดเสี่ยง + การแจ้งเตือน)
 */
async function buildPeriodReport(startDate, endDate) {
    const [people, safety, alerts] = await Promise.all([
        peopleCountService.getPeriodSummary(startDate, endDate),
        getSafetyReportsSummary(startDate, endDate),
        getCrowdAlertsSummary(startDate, endDate),
    ]);
    return {
        period: { start_date: startDate, end_date: endDate },
        people,
        safety_reports: safety,
        crowd_alerts: alerts,
    };
}

/**
 * คำนวณส่วนต่างและเปอร์เซ็นต์การเปลี่ยนแปลง (period1 = ฐาน, period2 = เทียบ)
 */
function buildMetricDelta(fromValue, toValue) {
    const from = fromValue || 0;
    const to = toValue || 0;
    const change = Math.round((to - from) * 10) / 10;
    let changePct;
    if (from === 0) {
        changePct = to === 0 ? 0 : 100;
    } else {
        changePct = Math.round(((to - from) / from) * 1000) / 10;
    }
    return { from, to, change, change_pct: changePct };
}

// GET /api/reports/monthly?month=YYYY-MM - รายงานสรุปรายเดือน (ค่าเริ่มต้น = เดือนปัจจุบัน)
app.get('/api/reports/monthly', async (req, res) => {
    const range = resolveMonthRange(req.query.month);
    if (!range) {
        return res.status(400).json({ success: false, error: 'รูปแบบ month ต้องเป็น YYYY-MM (เช่น 2026-06)' });
    }

    try {
        const [people, daily, safety, safetyByType, alerts] = await Promise.all([
            peopleCountService.getPeriodSummary(range.start, range.end),
            peopleCountService.getDailyBreakdown(range.start, range.end),
            getSafetyReportsSummary(range.start, range.end),
            getSafetyReportsByType(range.start, range.end),
            getCrowdAlertsSummary(range.start, range.end),
        ]);

        res.json({
            success: true,
            data: {
                month: range.month,
                period: { start_date: range.start, end_date: range.end },
                people,
                daily,
                safety_reports: { ...safety, by_type: safetyByType },
                crowd_alerts: alerts,
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/reports/compare - เปรียบเทียบสองช่วงเวลา (สำหรับวางแผนงบประมาณ)
//   แบบเดือน:    ?month1=YYYY-MM&month2=YYYY-MM
//   แบบกำหนดเอง: ?start1=YYYY-MM-DD&end1=YYYY-MM-DD&start2=YYYY-MM-DD&end2=YYYY-MM-DD
app.get('/api/reports/compare', async (req, res) => {
    const { month1, month2, start1, end1, start2, end2 } = req.query;

    let p1, p2;
    if (month1 || month2) {
        const r1 = resolveMonthRange(month1);
        const r2 = resolveMonthRange(month2);
        if (!r1 || !r2) {
            return res.status(400).json({ success: false, error: 'month1 และ month2 ต้องเป็นรูปแบบ YYYY-MM' });
        }
        p1 = { start: r1.start, end: r1.end };
        p2 = { start: r2.start, end: r2.end };
    } else if (start1 && end1 && start2 && end2) {
        if (![start1, end1, start2, end2].every(d => ISO_DATE_RE.test(d))) {
            return res.status(400).json({ success: false, error: 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD' });
        }
        if (start1 > end1 || start2 > end2) {
            return res.status(400).json({ success: false, error: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' });
        }
        p1 = { start: start1, end: end1 };
        p2 = { start: start2, end: end2 };
    } else {
        return res.status(400).json({
            success: false,
            error: 'ต้องระบุ month1+month2 หรือ start1+end1+start2+end2'
        });
    }

    try {
        const [period1, period2] = await Promise.all([
            buildPeriodReport(p1.start, p1.end),
            buildPeriodReport(p2.start, p2.end),
        ]);

        const difference = {
            avg_people: buildMetricDelta(period1.people?.avg_people, period2.people?.avg_people),
            max_people: buildMetricDelta(period1.people?.max_people, period2.people?.max_people),
            total_samples: buildMetricDelta(period1.people?.total_samples, period2.people?.total_samples),
            safety_reports_total: buildMetricDelta(period1.safety_reports?.total, period2.safety_reports?.total),
            crowd_alerts_total: buildMetricDelta(period1.crowd_alerts?.total, period2.crowd_alerts?.total),
        };

        res.json({ success: true, data: { period1, period2, difference } });
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

        if (result.error) {
            return res.status(503).json({
                success: false,
                data: result,
                error: 'Weather forecast is temporarily unavailable'
            });
        }

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
        res.status(503).json({
            success: false,
            error: 'Weather forecast is temporarily unavailable',
            details: error.message
        });
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

// ==================== LINE NOTIFICATION API (สำหรับ Frontend) ====================

// POST /api/notify/line - ส่งข้อความแจ้งเตือนผ่าน LINE OA (เจ้าหน้าที่เท่านั้น)
app.post('/api/notify/line', authMiddleware, officerOnlyMiddleware, async (req, res) => {
    try {
        const { message, type } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'กรุณาระบุข้อความที่ต้องการส่ง'
            });
        }

        // จำกัดความยาวข้อความ
        const trimmedMessage = message.substring(0, 2000);

        const result = await dailyReportService.sendLineMessage(trimmedMessage);

        console.log(`[LINE Notify] Type: ${type || 'custom'}, Success: ${result.success}`);

        res.json({
            success: result.success,
            message: result.success ? 'ส่งข้อความสำเร็จ' : 'ส่งข้อความไม่สำเร็จ',
            error: result.error || null
        });
    } catch (error) {
        console.error('[LINE Notify] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/notify/status - ตรวจสอบสถานะ LINE notification
app.get('/api/notify/status', (req, res) => {
    res.json({
        success: true,
        data: {
            line_configured: !!config.lineChannelAccessToken,
            thresholds: {
                warning: 1201,
                critical: 2501
            },
            alerts: {
                rain_check_interval: '10 นาที',
                crowd_warning: '>= 1,201 คน',
                crowd_critical: '>= 2,501 คน',
                daily_report: 'เสาร์-อาทิตย์ 23:00 น.'
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
${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
Version 4.0 - Real-time Alerts

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
app.use(notFoundHandler);

// ==================== Global Error Handler (ต้องเป็นตัวสุดท้าย) ====================
app.use(errorHandler);

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
            console.log(`Server: http://localhost:${config.port}`);
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
            console.log('   Crowd Alerts    - Real-time (>= 1,201 warning, >= 2,501 critical)');
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

if (process.env.NODE_ENV !== 'test') {
    start();
}

export default app;
