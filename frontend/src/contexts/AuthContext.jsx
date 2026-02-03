/* =====================================================
   Auth Context - ระบบจัดการ Authentication สำหรับ Frontend
   รองรับ LINE Login และ Role-based Access Control
   ===================================================== */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import liffService from '../services/liffService';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// สร้าง Context
const AuthContext = createContext(null);

// Role definitions (ต้องตรงกับ Backend)
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

    // Initialize LIFF และตรวจสอบ Login Status
    useEffect(() => {
        async function initAuth() {
            try {
                // 1. Initialize LIFF
                const liffResult = await liffService.initializeLiff();
                
                if (liffResult.success) {
                    setLiffReady(true);
                    
                    // 2. ถ้า Login ด้วย LINE อยู่แล้ว ให้ดึงข้อมูลและ Login กับ Backend
                    if (liffService.isLoggedIn()) {
                        await loginWithLine();
                    } else {
                        // 3. ถ้ายังไม่ได้ Login LINE ให้ตรวจสอบ Session เดิม
                        await loadUserFromSession();
                    }
                } else {
                    // LIFF ไม่ได้ Configure - ใช้ Session อย่างเดียว
                    console.warn('[Auth] LIFF not configured, using session only');
                    await loadUserFromSession();
                }
            } catch (err) {
                console.error('[Auth] Init error:', err);
                setError('ไม่สามารถเชื่อมต่อระบบได้');
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
            
            if (!accessToken) {
                console.error('[Auth] No LINE access token');
                return { success: false, error: 'ไม่พบ Access Token' };
            }

            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ lineAccessToken: accessToken })
            });

            const result = await response.json();

            if (result.success) {
                localStorage.setItem('sessionToken', result.data.session.token);
                localStorage.setItem('sessionExpiresAt', result.data.session.expiresAt);
                setUser(result.data.user);
                return { success: true };
            } else {
                setError(result.error);
                return { success: false, error: result.error };
            }
        } catch (err) {
            const errorMsg = 'ไม่สามารถเชื่อมต่อระบบได้';
            setError(errorMsg);
            return { success: false, error: errorMsg };
        }
    };

    // โหลดข้อมูลผู้ใช้จาก Session ที่เก็บไว้
    const loadUserFromSession = async () => {
        const sessionToken = localStorage.getItem('sessionToken');
        
        if (!sessionToken) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    setUser(result.data.user);
                }
            } else {
                // Session หมดอายุ
                localStorage.removeItem('sessionToken');
                localStorage.removeItem('sessionExpiresAt');
            }
        } catch (err) {
            console.error('[Auth] Load user error:', err);
        }
    };

    // เข้าสู่ระบบด้วย LINE
    const login = useCallback(() => {
        setError(null);
        
        if (liffReady && liffService.isConfigured()) {
            // ใช้ LINE LIFF Login
            liffService.login();
        } else {
            setError('ระบบ LINE Login ยังไม่พร้อมใช้งาน');
        }
    }, [liffReady]);

    // ออกจากระบบ
    const logout = async () => {
        const sessionToken = localStorage.getItem('sessionToken');

        try {
            // Logout จาก Backend
            await fetch(`${API_BASE}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });
        } catch (err) {
            console.error('[Auth] Logout error:', err);
        }

        // Clear local storage
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('sessionExpiresAt');
        setUser(null);

        // Logout จาก LINE LIFF
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

    // ตรวจสอบสิทธิ์ CCTV
    const canAccessCCTV = () => {
        return user?.role === ROLES.OFFICER && user?.roleVerified;
    };

    // ตรวจสอบสิทธิ์ดู Reports
    const canViewReports = () => {
        return user?.role !== ROLES.TOURIST;
    };

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

// Hook สำหรับใช้งาน Auth
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
