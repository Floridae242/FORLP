/* =====================================================
   Auth Context - ระบบจัดการ Authentication สำหรับ Frontend
   รองรับ LINE Login v2.1 (OAuth 2.0 Authorization Code Flow)
   Persistent Login: login ครั้งเดียว ไม่ต้อง login ซ้ำ
   ===================================================== */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://forlp-production.up.railway.app';

// Session Storage Keys
const SESSION_TOKEN_KEY = 'forlp_session_token';
const SESSION_EXPIRES_KEY = 'forlp_session_expires';
const USER_CACHE_KEY = 'forlp_user_cache';

// สร้าง Context
const AuthContext = createContext(null);

// Role definitions
export const ROLES = {
    VENDOR: 'vendor',
    RESIDENT: 'resident', 
    TOURIST: 'tourist',
    OFFICER: 'officer'
};

export const ROLE_INFO = {
    vendor: {
        label: 'ร้านค้า',
        description: 'ผู้ประกอบการร้านค้าในพื้นที่กาดกองต้า',
        permissions: [
            { text: 'ดูข้อมูลจำนวนผู้ใช้งานพื้นที่', allowed: true },
            { text: 'ดูข้อมูลสภาพอากาศและ PM2.5', allowed: true },
            { text: 'ดูรายงานข้อมูลย้อนหลัง', allowed: true },
            { text: 'เข้าถึงกล้องวงจรปิด', allowed: false }
        ]
    },
    resident: {
        label: 'ประชาชนในพื้นที่',
        description: 'ผู้อยู่อาศัยในพื้นที่ใกล้เคียงกาดกองต้า',
        permissions: [
            { text: 'ดูข้อมูลจำนวนผู้ใช้งานพื้นที่', allowed: true },
            { text: 'ดูข้อมูลสภาพอากาศและ PM2.5', allowed: true },
            { text: 'ดูรายงานข้อมูลย้อนหลัง', allowed: true },
            { text: 'เข้าถึงกล้องวงจรปิด', allowed: false }
        ]
    },
    tourist: {
        label: 'นักท่องเที่ยว',
        description: 'ผู้มาเยี่ยมชมถนนคนเดินกาดกองต้า',
        permissions: [
            { text: 'ดูข้อมูลจำนวนผู้ใช้งานพื้นที่', allowed: true },
            { text: 'ดูข้อมูลสภาพอากาศและ PM2.5', allowed: true },
            { text: 'ดูรายงานข้อมูลย้อนหลัง', allowed: false },
            { text: 'เข้าถึงกล้องวงจรปิด', allowed: false }
        ]
    },
    officer: {
        label: 'เจ้าหน้าที่',
        description: 'เจ้าหน้าที่เทศบาลนครลำปาง',
        requiresToken: true,
        permissions: [
            { text: 'ดูข้อมูลจำนวนผู้ใช้งานพื้นที่', allowed: true },
            { text: 'ดูข้อมูลสภาพอากาศและ PM2.5', allowed: true },
            { text: 'ดูรายงานข้อมูลย้อนหลัง', allowed: true },
            { text: 'เข้าถึงกล้องวงจรปิด', allowed: true }
        ]
    }
};

// Helper: บันทึก Session ลง localStorage
function saveSession(token, expiresAt, user) {
    try {
        localStorage.setItem(SESSION_TOKEN_KEY, token);
        localStorage.setItem(SESSION_EXPIRES_KEY, expiresAt);
        if (user) {
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
        }
    } catch (e) {
        console.warn('[Auth] Cannot save to localStorage:', e);
    }
}

// Helper: ลบ Session จาก localStorage
function clearSession() {
    try {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem(SESSION_EXPIRES_KEY);
        localStorage.removeItem(USER_CACHE_KEY);
    } catch (e) {
        console.warn('[Auth] Cannot clear localStorage:', e);
    }
}

// Helper: ดึง Session จาก localStorage
function getStoredSession() {
    try {
        const token = localStorage.getItem(SESSION_TOKEN_KEY);
        const expiresAt = localStorage.getItem(SESSION_EXPIRES_KEY);
        const userCache = localStorage.getItem(USER_CACHE_KEY);
        
        if (!token) return null;
        
        // ตรวจสอบว่า session หมดอายุหรือยัง
        if (expiresAt && new Date(expiresAt) < new Date()) {
            console.log('[Auth] Stored session expired');
            clearSession();
            return null;
        }
        
        return {
            token,
            expiresAt,
            userCache: userCache ? JSON.parse(userCache) : null
        };
    } catch (e) {
        console.warn('[Auth] Cannot read localStorage:', e);
        return null;
    }
}

// Auth Provider Component
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isProcessingCallback, setIsProcessingCallback] = useState(false);

    // Initialize Auth - ตรวจสอบ Session หรือ Callback จาก LINE
    useEffect(() => {
        async function initAuth() {
            try {
                console.log('[Auth] Starting initialization...');
                
                // ตรวจสอบว่ามี callback จาก LINE หรือไม่
                const urlParams = new URLSearchParams(window.location.search);
                const code = urlParams.get('code');
                const state = urlParams.get('state');
                const authError = urlParams.get('error');
                
                if (authError) {
                    // LINE ส่ง error กลับมา
                    const errorDesc = urlParams.get('error_description') || 'ไม่สามารถเข้าสู่ระบบได้';
                    console.error('[Auth] LINE returned error:', authError, errorDesc);
                    setError(decodeURIComponent(errorDesc));
                    window.history.replaceState({}, '', window.location.pathname);
                    setLoading(false);
                    return;
                }
                
                if (code && state) {
                    // มี callback จาก LINE - ดำเนินการ exchange token
                    console.log('[Auth] Processing LINE callback...');
                    setIsProcessingCallback(true);
                    await processLineCallback(code, state);
                    window.history.replaceState({}, '', window.location.pathname);
                    setIsProcessingCallback(false);
                } else {
                    // ไม่มี callback - ตรวจสอบ session เดิม (Persistent Login)
                    await loadUserFromSession();
                }
            } catch (err) {
                console.error('[Auth] Init error:', err);
                setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
            } finally {
                setLoading(false);
            }
        }

        initAuth();
    }, []);

    // Process LINE Callback - แลก Authorization Code เป็น Session
    const processLineCallback = async (code, state) => {
        try {
            console.log('[Auth] Exchanging code for session...');
            
            const response = await fetch(`${API_BASE}/api/auth/line/callback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code, state })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log('[Auth] Login successful:', result.data.user.displayName);
                
                // บันทึก Session แบบ Persistent
                saveSession(
                    result.data.session.token,
                    result.data.session.expiresAt,
                    result.data.user
                );
                
                setUser(result.data.user);
                setError(null);
                return { success: true };
            } else {
                console.error('[Auth] Callback failed:', result.error);
                setError(result.error || 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่');
                return { success: false, error: result.error };
            }
        } catch (err) {
            console.error('[Auth] Callback error:', err);
            setError('ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่อีกครั้ง');
            return { success: false, error: err.message };
        }
    };

    // โหลดข้อมูลผู้ใช้จาก Session (Persistent Login)
    const loadUserFromSession = async () => {
        const stored = getStoredSession();
        
        if (!stored) {
            console.log('[Auth] No stored session found');
            return false;
        }

        // แสดง cached user ก่อน (ให้ UI ตอบสนองเร็ว)
        if (stored.userCache) {
            setUser(stored.userCache);
        }

        try {
            console.log('[Auth] Validating session with backend...');
            const response = await fetch(`${API_BASE}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${stored.token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    console.log('[Auth] Session valid, user:', result.data.user.displayName);
                    
                    // อัปเดต user cache
                    saveSession(stored.token, stored.expiresAt, result.data.user);
                    setUser(result.data.user);
                    return true;
                }
            }
            
            // Session ไม่ valid - ลบ session แต่ไม่แสดง error
            console.log('[Auth] Session expired or invalid');
            clearSession();
            setUser(null);
            return false;
            
        } catch (err) {
            console.error('[Auth] Load user error:', err);
            // Network error - ใช้ cached user ถ้ามี
            if (stored.userCache) {
                console.log('[Auth] Using cached user due to network error');
                return true;
            }
            return false;
        }
    };

    // เริ่มต้น LINE Login Flow
    const login = useCallback(async () => {
        console.log('[Auth] Starting LINE Login flow...');
        setError(null);
        
        try {
            const response = await fetch(`${API_BASE}/api/auth/line/authorize`);
            const result = await response.json();
            
            if (result.success) {
                console.log('[Auth] Redirecting to LINE Login...');
                window.location.href = result.data.authorizationUrl;
            } else {
                console.error('[Auth] Failed to get auth URL:', result.error);
                setError(result.error || 'ไม่สามารถเริ่มต้นการเข้าสู่ระบบได้');
            }
        } catch (err) {
            console.error('[Auth] Login error:', err);
            setError('ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่อีกครั้ง');
        }
    }, []);

    // ออกจากระบบ (Revoke LINE Token + Clear Session)
    const logout = async () => {
        console.log('[Auth] Logging out...');
        const stored = getStoredSession();

        try {
            if (stored?.token) {
                await fetch(`${API_BASE}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${stored.token}`
                    }
                });
            }
        } catch (err) {
            console.error('[Auth] Logout error:', err);
        }

        // ล้างข้อมูล Session ทั้งหมด
        clearSession();
        setUser(null);
        setError(null);
    };

    // เปลี่ยน Role
    const updateRole = async (newRole, officerToken = null) => {
        const stored = getStoredSession();
        setError(null);

        if (!stored?.token) {
            return { success: false, error: 'กรุณาเข้าสู่ระบบก่อน' };
        }

        try {
            const response = await fetch(`${API_BASE}/api/auth/role`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${stored.token}`
                },
                body: JSON.stringify({ role: newRole, officerToken })
            });

            const result = await response.json();

            if (result.success) {
                // อัปเดต user และ cache
                saveSession(stored.token, stored.expiresAt, result.data.user);
                setUser(result.data.user);
                return { success: true, message: result.data.message };
            } else {
                setError(result.error);
                return { success: false, error: result.error };
            }
        } catch (err) {
            const errorMsg = 'ไม่สามารถเปลี่ยนบทบาทได้ กรุณาลองใหม่';
            setError(errorMsg);
            return { success: false, error: errorMsg };
        }
    };

    // ตรวจสอบสิทธิ์
    const canAccessCCTV = () => user?.role === ROLES.OFFICER && user?.roleVerified;
    const canViewReports = () => user?.role !== ROLES.TOURIST;

    // Refresh user data
    const refreshUser = useCallback(async () => {
        return loadUserFromSession();
    }, []);

    const value = {
        user,
        loading,
        error,
        isAuthenticated: !!user,
        isProcessingCallback,
        login,
        logout,
        updateRole,
        canAccessCCTV,
        canViewReports,
        clearError: () => setError(null),
        refreshUser
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
