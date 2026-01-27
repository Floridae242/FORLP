/* =====================================================
   Auth Context - ระบบจัดการ Authentication สำหรับ Frontend
   รองรับ LINE Login และ Role-based Access Control
   ===================================================== */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

    // โหลดข้อมูลผู้ใช้จาก Session
    const loadUser = useCallback(async () => {
        const sessionToken = localStorage.getItem('sessionToken');
        
        if (!sessionToken) {
            setLoading(false);
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
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUser();
    }, [loadUser]);

    // เข้าสู่ระบบด้วย LINE Access Token
    const login = async (lineAccessToken) => {
        setError(null);
        
        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ lineAccessToken })
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

    // ออกจากระบบ
    const logout = async () => {
        const sessionToken = localStorage.getItem('sessionToken');

        try {
            await fetch(`${API_BASE}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });
        } catch (err) {
            console.error('[Auth] Logout error:', err);
        }

        localStorage.removeItem('sessionToken');
        localStorage.removeItem('sessionExpiresAt');
        setUser(null);
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
