/* =====================================================
   Auth Context - ระบบจัดการ Authentication สำหรับ Frontend
   รองรับ LINE Login และ Role-based Access Control
   ===================================================== */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import liffService from '../services/liffService';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

// Auth Provider Component
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [liffReady, setLiffReady] = useState(false);

    // Initialize LIFF
    useEffect(() => {
        async function initAuth() {
            try {
                console.log('[Auth] Starting initialization...');
                console.log('[Auth] API_BASE:', API_BASE);
                console.log('[Auth] LIFF_ID:', liffService.getLiffId());
                
                // 1. Initialize LIFF
                const liffResult = await liffService.initializeLiff();
                console.log('[Auth] LIFF init result:', liffResult);
                
                if (liffResult.success) {
                    setLiffReady(true);
                    
                    // 2. ถ้า Login ด้วย LINE อยู่แล้ว
                    if (liffService.isLoggedIn()) {
                        console.log('[Auth] User is logged in with LINE');
                        await loginWithLine();
                    } else {
                        console.log('[Auth] User is NOT logged in with LINE');
                        // ตรวจสอบ Session เดิม
                        await loadUserFromSession();
                    }
                } else {
                    console.error('[Auth] LIFF init failed:', liffResult.error);
                    setError('ไม่สามารถเชื่อมต่อ LINE ได้: ' + liffResult.error);
                    await loadUserFromSession();
                }
            } catch (err) {
                console.error('[Auth] Init error:', err);
                setError('เกิดข้อผิดพลาด: ' + err.message);
            } finally {
                setLoading(false);
            }
        }

        initAuth();
    }, []);

    // Login กับ Backend โดยใช้ LINE Access Token
    const loginWithLine = async () => {
        try {
            const accessToken = liffService.getAccessToken();
            console.log('[Auth] Access Token:', accessToken ? 'exists' : 'null');
            
            if (!accessToken) {
                console.error('[Auth] No LINE access token');
                setError('ไม่พบ Access Token จาก LINE');
                return { success: false, error: 'ไม่พบ Access Token' };
            }

            console.log('[Auth] Calling backend login API...');
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ lineAccessToken: accessToken })
            });

            console.log('[Auth] Backend response status:', response.status);
            const result = await response.json();
            console.log('[Auth] Backend response:', result);

            if (result.success) {
                console.log('[Auth] Login successful:', result.data.user.displayName);
                localStorage.setItem('sessionToken', result.data.session.token);
                localStorage.setItem('sessionExpiresAt', result.data.session.expiresAt);
                setUser(result.data.user);
                setError(null);
                return { success: true };
            } else {
                console.error('[Auth] Login failed:', result.error);
                setError(result.error || 'เข้าสู่ระบบไม่สำเร็จ');
                return { success: false, error: result.error };
            }
        } catch (err) {
            console.error('[Auth] Login error:', err);
            setError('ไม่สามารถเชื่อมต่อ Backend ได้: ' + err.message);
            return { success: false, error: err.message };
        }
    };

    // โหลดข้อมูลผู้ใช้จาก Session
    const loadUserFromSession = async () => {
        const sessionToken = localStorage.getItem('sessionToken');
        
        if (!sessionToken) {
            console.log('[Auth] No session token found');
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

    // เข้าสู่ระบบด้วย LINE
    const login = useCallback(() => {
        console.log('[Auth] Manual login triggered');
        console.log('[Auth] liffReady:', liffReady);
        console.log('[Auth] isConfigured:', liffService.isConfigured());
        
        setError(null);
        
        if (liffReady && liffService.isConfigured()) {
            console.log('[Auth] Redirecting to LINE Login...');
            liffService.login();
        } else {
            const errMsg = 'ระบบ LINE Login ยังไม่พร้อมใช้งาน กรุณารอสักครู่';
            console.error('[Auth]', errMsg);
            setError(errMsg);
        }
    }, [liffReady]);

    // ออกจากระบบ
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

        localStorage.removeItem('sessionToken');
        localStorage.removeItem('sessionExpiresAt');
        setUser(null);

        if (liffReady && liffService.isLoggedIn()) {
            liffService.logout();
        }
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
            const errorMsg = 'ไม่สามารถเปลี่ยนบทบาทได้';
            setError(errorMsg);
            return { success: false, error: errorMsg };
        }
    };

    const canAccessCCTV = () => user?.role === ROLES.OFFICER && user?.roleVerified;
    const canViewReports = () => user?.role !== ROLES.TOURIST;

    const value = {
        user,
        loading,
        error,
        isAuthenticated: !!user,
        liffReady,
        isLiffConfigured: liffService.isConfigured(),
        login,
        logout,
        updateRole,
        canAccessCCTV,
        canViewReports,
        clearError: () => setError(null)
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
