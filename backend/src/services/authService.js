/* =====================================================
   Auth Service - ระบบยืนยันตัวตนและจัดการสิทธิ์
   รองรับ LINE Login และ Role-based Access Control
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

// ==================== HELPER FUNCTIONS ====================

/**
 * สร้าง Session Token
 */
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * ตรวจสอบ LINE Access Token และดึงข้อมูลผู้ใช้
 */
export async function verifyLineToken(accessToken) {
    try {
        // เรียก LINE API เพื่อดึงข้อมูลผู้ใช้
        const response = await fetch('https://api.line.me/v2/profile', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Invalid LINE access token');
        }

        const profile = await response.json();
        return {
            success: true,
            data: {
                userId: profile.userId,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl || null
            }
        };
    } catch (error) {
        console.error('[Auth] LINE token verification failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * สร้างหรืออัปเดตผู้ใช้จาก LINE Login
 */
export function upsertUser(lineUserId, displayName, pictureUrl) {
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

        return db.prepare('SELECT * FROM users WHERE line_user_id = ?').get(lineUserId);
    } else {
        // สร้างผู้ใช้ใหม่ (default role = tourist)
        db.prepare(`
            INSERT INTO users (line_user_id, display_name, picture_url, role, last_login_at)
            VALUES (?, ?, ?, 'tourist', ?)
        `).run(lineUserId, displayName, pictureUrl, now);

        return db.prepare('SELECT * FROM users WHERE line_user_id = ?').get(lineUserId);
    }
}

/**
 * สร้าง Session สำหรับผู้ใช้
 */
export function createSession(userId) {
    const db = getDb();
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 วัน

    db.prepare(`
        INSERT INTO user_sessions (user_id, session_token, expires_at)
        VALUES (?, ?, ?)
    `).run(userId, sessionToken, expiresAt);

    return { sessionToken, expiresAt };
}

/**
 * ตรวจสอบ Session Token
 */
export function verifySession(sessionToken) {
    const db = getDb();
    const now = new Date().toISOString();

    const session = db.prepare(`
        SELECT s.*, u.* 
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.session_token = ? AND s.expires_at > ?
    `).get(sessionToken, now);

    if (!session) {
        return { valid: false, error: 'Session invalid or expired' };
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
        return { success: false, error: 'Role ไม่ถูกต้อง' };
    }

    // ถ้าเลือก Role เจ้าหน้าที่ ต้องมี Token
    if (newRole === ROLES.OFFICER) {
        if (!officerToken) {
            return { success: false, error: 'กรุณากรอก Token สำหรับเจ้าหน้าที่' };
        }

        // ตรวจสอบ Token
        const tokenRecord = db.prepare(`
            SELECT * FROM officer_tokens 
            WHERE token = ? AND is_used = 0 
            AND (expires_at IS NULL OR expires_at > ?)
        `).get(officerToken, now);

        if (!tokenRecord) {
            return { success: false, error: 'Token ไม่ถูกต้อง หมดอายุ หรือถูกใช้งานแล้ว' };
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

/**
 * Middleware ตรวจสอบ Authentication
 */
export function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            error: 'กรุณาเข้าสู่ระบบ' 
        });
    }

    const sessionToken = authHeader.substring(7);
    const result = verifySession(sessionToken);

    if (!result.valid) {
        return res.status(401).json({ 
            success: false, 
            error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' 
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

export const authService = {
    ROLES,
    ROLE_PERMISSIONS,
    verifyLineToken,
    upsertUser,
    createSession,
    verifySession,
    deleteSession,
    getUserById,
    updateUserRole,
    canAccessCCTV,
    authMiddleware,
    officerOnlyMiddleware
};

export default authService;
