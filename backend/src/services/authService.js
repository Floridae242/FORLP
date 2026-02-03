/* =====================================================
   Auth Service - ระบบยืนยันตัวตนและจัดการสิทธิ์
   รองรับ LINE Login v2.1 (OAuth 2.0 Authorization Code Flow)
   ===================================================== */

import { getDb } from '../db/index.js';
import { config } from '../config/index.js';
import crypto from 'crypto';

// ==================== ROLE DEFINITIONS ====================
export const ROLES = {
    VENDOR: 'vendor',       // ร้านค้า
    RESIDENT: 'resident',   // ประชาชนในพื้นที่
    TOURIST: 'tourist',     // นักท่องเที่ยว
    OFFICER: 'officer'      // เจ้าหน้าที่
};

// สิทธิ์ของแต่ละ Role
export const ROLE_PERMISSIONS = {
    vendor: {
        label: 'ร้านค้า',
        description: 'ผู้ประกอบการร้านค้าในพื้นที่กาดกองต้า',
        canViewPeopleCount: true,
        canViewWeather: true,
        canViewReports: true,
        canViewCCTV: false,
        canViewAdminDashboard: false
    },
    resident: {
        label: 'ประชาชนในพื้นที่',
        description: 'ผู้อยู่อาศัยในพื้นที่ใกล้เคียงกาดกองต้า',
        canViewPeopleCount: true,
        canViewWeather: true,
        canViewReports: true,
        canViewCCTV: false,
        canViewAdminDashboard: false
    },
    tourist: {
        label: 'นักท่องเที่ยว',
        description: 'ผู้มาเยี่ยมชมถนนคนเดินกาดกองต้า',
        canViewPeopleCount: true,
        canViewWeather: true,
        canViewReports: false,
        canViewCCTV: false,
        canViewAdminDashboard: false
    },
    officer: {
        label: 'เจ้าหน้าที่',
        description: 'เจ้าหน้าที่เทศบาลนครลำปาง',
        canViewPeopleCount: true,
        canViewWeather: true,
        canViewReports: true,
        canViewCCTV: true,
        canViewAdminDashboard: true
    }
};

// ==================== LINE LOGIN v2.1 OAUTH 2.0 ====================

/**
 * สร้าง State Token สำหรับป้องกัน CSRF
 */
export function generateStateToken() {
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * สร้าง Nonce สำหรับป้องกัน Replay Attack
 */
export function generateNonce() {
    return crypto.randomBytes(16).toString('base64url');
}

/**
 * สร้าง Session Token
 */
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * สร้าง LINE Authorization URL
 * ตาม LINE Login v2.1 API Reference
 */
export function getLineAuthorizationUrl(state, nonce) {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.lineLoginChannelId,
        redirect_uri: config.lineLoginCallbackUrl,
        state: state,
        scope: 'profile openid',
        nonce: nonce,
        prompt: 'consent',
        bot_prompt: 'normal'
    });

    return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

/**
 * แลก Authorization Code เป็น Access Token
 * POST https://api.line.me/oauth2/v2.1/token
 */
export async function exchangeCodeForToken(code) {
    try {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: config.lineLoginCallbackUrl,
            client_id: config.lineLoginChannelId,
            client_secret: config.lineLoginChannelSecret
        });

        const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Auth] Token exchange failed:', errorData);
            return { 
                success: false, 
                error: errorData.error_description || 'ไม่สามารถเชื่อมต่อกับ LINE ได้' 
            };
        }

        const tokenData = await response.json();
        
        return {
            success: true,
            data: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresIn: tokenData.expires_in,
                idToken: tokenData.id_token,
                tokenType: tokenData.token_type,
                scope: tokenData.scope
            }
        };
    } catch (error) {
        console.error('[Auth] Token exchange error:', error.message);
        return { 
            success: false, 
            error: 'ไม่สามารถเชื่อมต่อกับ LINE ได้ กรุณาลองใหม่อีกครั้ง' 
        };
    }
}

/**
 * Verify ID Token และดึงข้อมูลผู้ใช้
 * POST https://api.line.me/oauth2/v2.1/verify
 */
export async function verifyIdToken(idToken, nonce = null) {
    try {
        const params = new URLSearchParams({
            id_token: idToken,
            client_id: config.lineLoginChannelId
        });

        if (nonce) {
            params.append('nonce', nonce);
        }

        const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Auth] ID Token verification failed:', errorData);
            return { success: false, error: errorData.error_description || 'Token ไม่ถูกต้อง' };
        }

        const payload = await response.json();
        
        return {
            success: true,
            data: {
                userId: payload.sub,
                displayName: payload.name || null,
                pictureUrl: payload.picture || null,
                email: payload.email || null
            }
        };
    } catch (error) {
        console.error('[Auth] ID Token verify error:', error.message);
        return { success: false, error: 'ไม่สามารถยืนยันตัวตนได้' };
    }
}

/**
 * ตรวจสอบ Access Token validity
 * GET https://api.line.me/oauth2/v2.1/verify
 */
export async function verifyAccessToken(accessToken) {
    try {
        const response = await fetch(
            `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
        );

        if (!response.ok) {
            return { valid: false, error: 'Access token หมดอายุหรือไม่ถูกต้อง' };
        }

        const data = await response.json();
        return {
            valid: true,
            expiresIn: data.expires_in,
            clientId: data.client_id,
            scope: data.scope
        };
    } catch (error) {
        console.error('[Auth] Access token verify error:', error.message);
        return { valid: false, error: 'ไม่สามารถตรวจสอบ token ได้' };
    }
}

/**
 * ดึงข้อมูลผู้ใช้จาก LINE Profile API
 * GET https://api.line.me/v2/profile
 */
export async function getLineProfile(accessToken) {
    try {
        const response = await fetch('https://api.line.me/v2/profile', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            return { success: false, error: 'ไม่สามารถดึงข้อมูลผู้ใช้ได้' };
        }

        const profile = await response.json();
        return {
            success: true,
            data: {
                userId: profile.userId,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl || null,
                statusMessage: profile.statusMessage || null
            }
        };
    } catch (error) {
        console.error('[Auth] Get profile error:', error.message);
        return { success: false, error: 'ไม่สามารถดึงข้อมูลผู้ใช้ได้' };
    }
}

/**
 * Refresh Access Token
 * POST https://api.line.me/oauth2/v2.1/token
 */
export async function refreshAccessToken(refreshToken) {
    try {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: config.lineLoginChannelId,
            client_secret: config.lineLoginChannelSecret
        });

        const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Auth] Token refresh failed:', errorData);
            return { success: false, error: 'ไม่สามารถต่ออายุ token ได้' };
        }

        const tokenData = await response.json();
        return {
            success: true,
            data: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresIn: tokenData.expires_in,
                tokenType: tokenData.token_type,
                scope: tokenData.scope
            }
        };
    } catch (error) {
        console.error('[Auth] Token refresh error:', error.message);
        return { success: false, error: 'ไม่สามารถต่ออายุ token ได้' };
    }
}

/**
 * Revoke Access Token (Logout จาก LINE)
 * POST https://api.line.me/oauth2/v2.1/revoke
 */
export async function revokeAccessToken(accessToken) {
    try {
        const params = new URLSearchParams({
            access_token: accessToken,
            client_id: config.lineLoginChannelId,
            client_secret: config.lineLoginChannelSecret
        });

        const response = await fetch('https://api.line.me/oauth2/v2.1/revoke', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        // LINE API returns 200 with empty body on success
        return { success: response.ok };
    } catch (error) {
        console.error('[Auth] Token revoke error:', error.message);
        return { success: false, error: 'ไม่สามารถยกเลิก token ได้' };
    }
}

// ==================== USER MANAGEMENT ====================

/**
 * สร้างหรืออัปเดตผู้ใช้จาก LINE Login
 */
export function upsertUser(lineUserId, displayName, pictureUrl, lineTokens = null) {
    const db = getDb();
    const now = new Date().toISOString();

    // ตรวจสอบว่ามีผู้ใช้อยู่แล้วหรือไม่
    const existingUser = db.prepare('SELECT * FROM users WHERE line_user_id = ?').get(lineUserId);

    if (existingUser) {
        // อัปเดตข้อมูลผู้ใช้
        db.prepare(`
            UPDATE users SET 
                display_name = ?,
                picture_url = ?,
                last_login_at = ?,
                updated_at = ?
            WHERE line_user_id = ?
        `).run(displayName, pictureUrl, now, now, lineUserId);

        // อัปเดต LINE Tokens ถ้ามี
        if (lineTokens) {
            updateUserLineTokens(existingUser.id, lineTokens);
        }

        return db.prepare('SELECT * FROM users WHERE line_user_id = ?').get(lineUserId);
    } else {
        // สร้างผู้ใช้ใหม่ (default role = tourist)
        db.prepare(`
            INSERT INTO users (line_user_id, display_name, picture_url, role, last_login_at)
            VALUES (?, ?, ?, 'tourist', ?)
        `).run(lineUserId, displayName, pictureUrl, now);

        const newUser = db.prepare('SELECT * FROM users WHERE line_user_id = ?').get(lineUserId);

        // บันทึก LINE Tokens ถ้ามี
        if (lineTokens) {
            updateUserLineTokens(newUser.id, lineTokens);
        }

        return newUser;
    }
}

/**
 * อัปเดต LINE Tokens ของผู้ใช้ (เก็บไว้ฝั่ง Backend เท่านั้น)
 */
export function updateUserLineTokens(userId, tokens) {
    const db = getDb();
    const now = new Date().toISOString();
    
    // คำนวณวันหมดอายุ
    const accessTokenExpiresAt = new Date(Date.now() + (tokens.expiresIn || 2592000) * 1000).toISOString();
    const refreshTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 วัน

    // ลบ tokens เก่า
    db.prepare('DELETE FROM user_line_tokens WHERE user_id = ?').run(userId);

    // บันทึก tokens ใหม่
    db.prepare(`
        INSERT INTO user_line_tokens 
        (user_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        userId, 
        tokens.accessToken, 
        tokens.refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        now
    );
}

/**
 * ดึง LINE Tokens ของผู้ใช้
 */
export function getUserLineTokens(userId) {
    const db = getDb();
    return db.prepare('SELECT * FROM user_line_tokens WHERE user_id = ?').get(userId);
}

/**
 * สร้าง Session สำหรับผู้ใช้
 */
export function createSession(userId) {
    const db = getDb();
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + config.sessionMaxAge).toISOString();

    db.prepare(`
        INSERT INTO user_sessions (user_id, session_token, expires_at)
        VALUES (?, ?, ?)
    `).run(userId, sessionToken, expiresAt);

    return { sessionToken, expiresAt };
}

/**
 * ตรวจสอบ Session Token และ Refresh LINE Token ถ้าจำเป็น
 */
export async function verifySession(sessionToken) {
    const db = getDb();
    const now = new Date().toISOString();

    const session = db.prepare(`
        SELECT s.*, u.* 
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.session_token = ? AND s.expires_at > ?
    `).get(sessionToken, now);

    if (!session) {
        return { valid: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' };
    }

    // ตรวจสอบและ Refresh LINE Token ถ้าใกล้หมดอายุ
    const lineTokens = getUserLineTokens(session.user_id);
    if (lineTokens) {
        const accessTokenExpires = new Date(lineTokens.access_token_expires_at);
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

        // ถ้า access token จะหมดอายุภายใน 1 ชั่วโมง ให้ refresh
        if (accessTokenExpires < oneHourFromNow && lineTokens.refresh_token) {
            const refreshResult = await refreshAccessToken(lineTokens.refresh_token);
            if (refreshResult.success) {
                updateUserLineTokens(session.user_id, refreshResult.data);
                console.log(`[Auth] Refreshed LINE token for user ${session.user_id}`);
            }
        }
    }

    return {
        valid: true,
        user: {
            id: session.user_id,
            lineUserId: session.line_user_id,
            displayName: session.display_name,
            pictureUrl: session.picture_url,
            role: session.role,
            roleVerified: session.role_verified === 1,
            permissions: ROLE_PERMISSIONS[session.role]
        }
    };
}

/**
 * ลบ Session (Logout)
 */
export function deleteSession(sessionToken) {
    const db = getDb();
    db.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(sessionToken);
}

/**
 * ลบ Session และ Revoke LINE Token
 */
export async function logoutUser(sessionToken) {
    const db = getDb();
    
    // ดึง session เพื่อหา user_id
    const session = db.prepare('SELECT * FROM user_sessions WHERE session_token = ?').get(sessionToken);
    
    if (session) {
        // ดึง LINE Token เพื่อ revoke
        const lineTokens = getUserLineTokens(session.user_id);
        
        if (lineTokens && lineTokens.access_token) {
            // Revoke LINE Access Token
            await revokeAccessToken(lineTokens.access_token);
            
            // ลบ LINE Tokens จาก database
            db.prepare('DELETE FROM user_line_tokens WHERE user_id = ?').run(session.user_id);
        }
        
        // ลบ Session
        db.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(sessionToken);
    }
    
    return { success: true };
}

/**
 * ดึงข้อมูลผู้ใช้จาก ID
 */
export function getUserById(userId) {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    if (!user) return null;

    return {
        id: user.id,
        lineUserId: user.line_user_id,
        displayName: user.display_name,
        pictureUrl: user.picture_url,
        role: user.role,
        roleVerified: user.role_verified === 1,
        permissions: ROLE_PERMISSIONS[user.role],
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at
    };
}

/**
 * อัปเดต Role ของผู้ใช้
 */
export function updateUserRole(userId, newRole, officerToken = null) {
    const db = getDb();
    const now = new Date().toISOString();

    // ตรวจสอบว่า Role ถูกต้อง
    if (!Object.values(ROLES).includes(newRole)) {
        return { success: false, error: 'บทบาทที่เลือกไม่ถูกต้อง' };
    }

    // ถ้าเลือก Role เจ้าหน้าที่ ต้องมี Token
    if (newRole === ROLES.OFFICER) {
        if (!officerToken) {
            return { success: false, error: 'กรุณากรอกรหัสยืนยันตัวตนสำหรับเจ้าหน้าที่' };
        }

        // ตรวจสอบ Token
        const tokenRecord = db.prepare(`
            SELECT * FROM officer_tokens 
            WHERE token = ? AND is_used = 0 
            AND (expires_at IS NULL OR expires_at > ?)
        `).get(officerToken, now);

        if (!tokenRecord) {
            return { success: false, error: 'รหัสยืนยันไม่ถูกต้อง หมดอายุ หรือถูกใช้งานแล้ว' };
        }

        // อัปเดต Role เป็นเจ้าหน้าที่
        db.prepare(`
            UPDATE users SET 
                role = 'officer',
                role_verified = 1,
                officer_token_used = ?,
                updated_at = ?
            WHERE id = ?
        `).run(officerToken, now, userId);

        // Mark token as used
        db.prepare(`
            UPDATE officer_tokens SET 
                is_used = 1,
                used_by_user_id = ?,
                used_at = ?
            WHERE token = ?
        `).run(userId, now, officerToken);

        return { success: true, role: 'officer', verified: true };
    }

    // สำหรับ Role อื่นๆ ไม่ต้องยืนยัน Token
    db.prepare(`
        UPDATE users SET 
            role = ?,
            role_verified = 0,
            officer_token_used = NULL,
            updated_at = ?
        WHERE id = ?
    `).run(newRole, now, userId);

    return { success: true, role: newRole, verified: false };
}

/**
 * ตรวจสอบสิทธิ์เข้าถึง CCTV
 */
export function canAccessCCTV(user) {
    if (!user) return false;
    return user.role === ROLES.OFFICER && user.roleVerified;
}

// ==================== AUTH STATE MANAGEMENT ====================

// เก็บ state และ nonce ชั่วคราว (ในระบบจริงควรใช้ Redis หรือ Database)
const authStates = new Map();

/**
 * บันทึก Auth State (state + nonce)
 */
export function saveAuthState(state, nonce) {
    const expiresAt = Date.now() + 10 * 60 * 1000; // หมดอายุใน 10 นาที
    authStates.set(state, { nonce, expiresAt });
    
    // ลบ state ที่หมดอายุ
    for (const [key, value] of authStates) {
        if (value.expiresAt < Date.now()) {
            authStates.delete(key);
        }
    }
}

/**
 * ตรวจสอบและดึง Auth State
 */
export function getAndRemoveAuthState(state) {
    const data = authStates.get(state);
    
    if (!data) {
        return null;
    }
    
    if (data.expiresAt < Date.now()) {
        authStates.delete(state);
        return null;
    }
    
    authStates.delete(state);
    return data;
}

// ==================== MIDDLEWARE ====================

/**
 * Middleware ตรวจสอบ Authentication
 */
export async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            error: 'กรุณาเข้าสู่ระบบ' 
        });
    }

    const sessionToken = authHeader.substring(7);
    const result = await verifySession(sessionToken);

    if (!result.valid) {
        return res.status(401).json({ 
            success: false, 
            error: result.error || 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' 
        });
    }

    req.user = result.user;
    next();
}

/**
 * Middleware ตรวจสอบสิทธิ์เจ้าหน้าที่
 */
export function officerOnlyMiddleware(req, res, next) {
    if (!req.user || !canAccessCCTV(req.user)) {
        return res.status(403).json({ 
            success: false, 
            error: 'เฉพาะเจ้าหน้าที่ที่ได้รับอนุญาตเท่านั้น' 
        });
    }
    next();
}

// ==================== LEGACY SUPPORT ====================

/**
 * ตรวจสอบ LINE Access Token (Legacy - สำหรับ backward compatibility)
 */
export async function verifyLineToken(accessToken) {
    const profileResult = await getLineProfile(accessToken);
    
    if (!profileResult.success) {
        return { success: false, error: profileResult.error };
    }
    
    return {
        success: true,
        data: profileResult.data
    };
}

// ==================== EXPORTS ====================

export const authService = {
    ROLES,
    ROLE_PERMISSIONS,
    // LINE Login v2.1
    generateStateToken,
    generateNonce,
    getLineAuthorizationUrl,
    exchangeCodeForToken,
    verifyIdToken,
    verifyAccessToken,
    getLineProfile,
    refreshAccessToken,
    revokeAccessToken,
    // User Management
    upsertUser,
    updateUserLineTokens,
    getUserLineTokens,
    createSession,
    verifySession,
    deleteSession,
    logoutUser,
    getUserById,
    updateUserRole,
    canAccessCCTV,
    // Auth State
    saveAuthState,
    getAndRemoveAuthState,
    // Middleware
    authMiddleware,
    officerOnlyMiddleware,
    // Legacy
    verifyLineToken
};

export default authService;
