/* =====================================================
   Auth Service - ระบบยืนยันตัวตนและจัดการสิทธิ์
   รองรับ LINE Login v2.1 (OAuth 2.0 Authorization Code Flow)
   ===================================================== */

import { query, queryOne, execute, transaction } from '../db/index.js';
import { config } from '../config/index.js';
import crypto from 'crypto';

// ==================== ROLE DEFINITIONS ====================
export const ROLES = {
    OFFICER: 'officer'      // เจ้าหน้าที่
};

// สิทธิ์ของแต่ละ Role
export const ROLE_PERMISSIONS = {
    officer: {
        label: 'เจ้าหน้าที่',
        description: 'เจ้าหน้าที่ผู้ดูแลระบบ (Venue Officer)',
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
export async function upsertUser(lineUserId, displayName, pictureUrl, lineTokens = null) {
    const now = new Date().toISOString();
    const existingUser = await queryOne('SELECT * FROM users WHERE line_user_id = $1', [lineUserId]);

    if (existingUser) {
        await execute(
            `UPDATE users SET display_name=$1, picture_url=$2, last_login_at=$3, updated_at=$4
             WHERE line_user_id=$5`,
            [displayName, pictureUrl, now, now, lineUserId]
        );
        if (lineTokens) await updateUserLineTokens(existingUser.id, lineTokens);
        return queryOne('SELECT * FROM users WHERE line_user_id = $1', [lineUserId]);
    } else {
        await execute(
            `INSERT INTO users (line_user_id, display_name, picture_url, role, last_login_at)
             VALUES ($1,$2,$3,'officer',$4)`,
            [lineUserId, displayName, pictureUrl, now]
        );
        const newUser = await queryOne('SELECT * FROM users WHERE line_user_id = $1', [lineUserId]);
        if (lineTokens) await updateUserLineTokens(newUser.id, lineTokens);
        return newUser;
    }
}

/**
 * อัปเดต LINE Tokens ของผู้ใช้ (เก็บไว้ฝั่ง Backend เท่านั้น)
 */
export async function updateUserLineTokens(userId, tokens) {
    const accessTokenExpiresAt = new Date(Date.now() + (tokens.expiresIn || 2592000) * 1000).toISOString();
    const refreshTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    await execute('DELETE FROM user_line_tokens WHERE user_id = $1', [userId]);
    await execute(
        `INSERT INTO user_line_tokens
         (user_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())`,
        [userId, tokens.accessToken, tokens.refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt]
    );
}

/**
 * ดึง LINE Tokens ของผู้ใช้
 */
export async function getUserLineTokens(userId) {
    return queryOne('SELECT * FROM user_line_tokens WHERE user_id = $1', [userId]);
}

/**
 * สร้าง Session สำหรับผู้ใช้
 */
export async function createSession(userId) {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + config.sessionMaxAge).toISOString();
    await execute(
        'INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES ($1,$2,$3)',
        [userId, sessionToken, expiresAt]
    );
    return { sessionToken, expiresAt };
}

/**
 * ตรวจสอบ Session Token และ Refresh LINE Token ถ้าจำเป็น
 */
export async function verifySession(sessionToken) {
    const now = new Date().toISOString();
    const session = await queryOne(
        `SELECT s.*, u.id as user_id, u.line_user_id, u.display_name, u.picture_url,
                u.role, u.role_verified
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1 AND s.expires_at > $2`,
        [sessionToken, now]
    );

    if (!session) {
        return { valid: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' };
    }

    const lineTokens = await getUserLineTokens(session.user_id);
    if (lineTokens) {
        const accessTokenExpires = new Date(lineTokens.access_token_expires_at);
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
        if (accessTokenExpires < oneHourFromNow && lineTokens.refresh_token) {
            const refreshResult = await refreshAccessToken(lineTokens.refresh_token);
            if (refreshResult.success) {
                await updateUserLineTokens(session.user_id, refreshResult.data);
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
export async function deleteSession(sessionToken) {
    await execute('DELETE FROM user_sessions WHERE session_token = $1', [sessionToken]);
}

/**
 * ลบ Session และ Revoke LINE Token
 */
export async function logoutUser(sessionToken) {
    const session = await queryOne('SELECT * FROM user_sessions WHERE session_token = $1', [sessionToken]);
    if (session) {
        const lineTokens = await getUserLineTokens(session.user_id);
        if (lineTokens?.access_token) {
            await revokeAccessToken(lineTokens.access_token);
            await execute('DELETE FROM user_line_tokens WHERE user_id = $1', [session.user_id]);
        }
        await execute('DELETE FROM user_sessions WHERE session_token = $1', [sessionToken]);
    }
    return { success: true };
}

/**
 * ดึงข้อมูลผู้ใช้จาก ID
 */
export async function getUserById(userId) {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
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
export async function updateUserRole(userId, newRole, officerToken = null) {
    if (!Object.values(ROLES).includes(newRole)) {
        return { success: false, error: 'บทบาทที่เลือกไม่ถูกต้อง' };
    }

    if (newRole === ROLES.OFFICER) {
        if (!officerToken) {
            return { success: false, error: 'กรุณากรอกรหัสยืนยันตัวตนสำหรับเจ้าหน้าที่' };
        }
        const now = new Date().toISOString();
        const tokenRecord = await queryOne(
            `SELECT * FROM officer_tokens
             WHERE token = $1 AND is_used = 0
             AND (expires_at IS NULL OR expires_at > $2)`,
            [officerToken, now]
        );
        if (!tokenRecord) {
            return { success: false, error: 'รหัสยืนยันไม่ถูกต้อง หมดอายุ หรือถูกใช้งานแล้ว' };
        }
        await execute(
            `UPDATE users SET role='officer', role_verified=1, officer_token_used=$1, updated_at=$2
             WHERE id=$3`,
            [officerToken, now, userId]
        );
        await execute(
            `UPDATE officer_tokens SET is_used=1, used_by_user_id=$1, used_at=$2 WHERE token=$3`,
            [userId, now, officerToken]
        );
        return { success: true, role: 'officer', verified: true };
    }

    return { success: false, error: 'บทบาทที่เลือกไม่ถูกต้อง' };
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
