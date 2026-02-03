/* =====================================================
   Auth Context - ระบบจัดการ Authentication สำหรับ Frontend
   รองรับ LINE Login v2.1 (OAuth 2.0 Authorization Code Flow)
   ===================================================== */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
        icon: '🏪',
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
        icon: '🏠',
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
        icon: '🎒',
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
        icon: '👔',
        requiresToken: true,
        permissions: [
            { text: 'ดูข้อมูลจำนวนผู้ใช้งานพื้นที่', allowed: true },
            { text: 'ดูข้อมูลสภาพอากาศและ PM2.5', allowed: true },
            { text: 'ดูรายงานข้อมูลย้อนหลัง', allowed: true },
            { text: 'เข้าถึงกล้องวงจรปิด', allowed: true }
        ]
    }
};

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
                    // ล้าง URL
                    window.history.replaceState({}, '', window.location.pathname);
                    setLoading(false);
                    return;
                }
                
                if (code && state) {
                    // มี callback จาก LINE - ดำเนินการ exchange token
                    console.log('[Auth] Processing LINE callback...');
                    setIsProcessingCallback(true);
                    await processLineCallback(code, state);
                    // ล้าง URL หลังจาก process เสร็จ
                    window.history.replaceState({}, '', window.location.pathname);
                    setIsProcessingCallback(false);
                } else {
                    // ไม่มี callback - ตรวจสอบ session เดิม
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
                // บันทึก Session Token ใน localStorage
                localStorage.setItem('sessionToken', result.data.session.token);
                localStorage.setItem('sessionExpiresAt', result.data.session.expiresAt);
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

    // โหลดข้อมูลผู้ใช้จาก Session
    const loadUserFromSession = async () => {
        const sessionToken = localStorage.getItem('sessionToken');
        const expiresAt = localStorage.getItem('sessionExpiresAt');
        
        if (!sessionToken) {
            console.log('[Auth] No session token found');
            return false;
        }
        
        // ตรวจสอบว่า session หมดอายุหรือยัง
        if (expiresAt && new Date(expiresAt) < new Date()) {
            console.log('[Auth] Session expired');
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('sessionExpiresAt');
            return false;
        }

        try {
            console.log('[Auth] Loading user from session...');
            const response = await fetch(`${API_BASE}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    console.log('[Auth] Session valid, user:', result.data.user.displayName);
                    setUser(result.data.user);
                    return true;
                }
            } else {
                console.log('[Auth] Session expired or invalid');
                localStorage.removeItem('sessionToken');
                localStorage.removeItem('sessionExpiresAt');
            }
        } catch (err) {
            console.error('[Auth] Load user error:', err);
        }
        return false;
    };

    // เริ่มต้น LINE Login Flow
    const login = useCallback(async () => {
        console.log('[Auth] Starting LINE Login flow...');
        setError(null);
        
        try {
            // เรียก Backend เพื่อสร้าง Authorization URL
            const response = await fetch(`${API_BASE}/api/auth/line/authorize`);
            const result = await response.json();
            
            if (result.success) {
                console.log('[Auth] Redirecting to LINE Login...');
                // Redirect ไปหน้า LINE Login
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

    // ออกจากระบบ (Revoke LINE Token)
    const logout = async () => {
        console.log('[Auth] Logging out...');
        const sessionToken = localStorage.getItem('sessionToken');

        try {
            if (sessionToken) {
                await fetch(`${API_BASE}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`
                    }
                });
            }
        } catch (err) {
            console.error('[Auth] Logout error:', err);
        }

        // ล้างข้อมูล Session
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('sessionExpiresAt');
        setUser(null);
        setError(null);
    };

    // เปลี่ยน Role
    const updateRole = async (newRole, officerToken = null) => {
        const sessionToken = localStorage.getItem('sessionToken');
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/api/auth/role`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ role: newRole, officerToken })
            });

            const result = await response.json();

            if (result.success) {
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
        refreshUser: loadUserFromSession
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
