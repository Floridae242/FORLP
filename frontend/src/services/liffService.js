/* =====================================================
   LINE LIFF Service - เชื่อมต่อกับ LINE Login
   ===================================================== */

import liff from '@line/liff';

// LIFF ID จาก LINE Developers Console
const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';

let isInitialized = false;
let initError = null;

/**
 * Initialize LIFF
 */
export async function initializeLiff() {
    if (isInitialized) return { success: true };
    
    if (!LIFF_ID) {
        console.warn('[LIFF] LIFF_ID not configured');
        return { success: false, error: 'LIFF_ID not configured' };
    }

    try {
        await liff.init({ liffId: LIFF_ID });
        isInitialized = true;
        console.log('[LIFF] Initialized successfully');
        return { success: true };
    } catch (error) {
        initError = error;
        console.error('[LIFF] Initialization failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * ตรวจสอบว่า Login อยู่หรือไม่
 */
export function isLoggedIn() {
    if (!isInitialized) return false;
    return liff.isLoggedIn();
}

/**
 * Login ด้วย LINE
 */
export function login(redirectUri = null) {
    if (!isInitialized) {
        console.error('[LIFF] Not initialized');
        return;
    }
    
    const options = redirectUri ? { redirectUri } : undefined;
    liff.login(options);
}

/**
 * Logout จาก LINE
 */
export function logout() {
    if (!isInitialized) return;
    liff.logout();
}

/**
 * ดึง Access Token
 */
export function getAccessToken() {
    if (!isInitialized || !liff.isLoggedIn()) return null;
    return liff.getAccessToken();
}

/**
 * ดึงข้อมูล Profile จาก LINE
 */
export async function getProfile() {
    if (!isInitialized || !liff.isLoggedIn()) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const profile = await liff.getProfile();
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
        console.error('[LIFF] Get profile failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * ตรวจสอบว่าอยู่ใน LINE App หรือไม่
 */
export function isInClient() {
    if (!isInitialized) return false;
    return liff.isInClient();
}

/**
 * ปิด LIFF window (ใช้เมื่ออยู่ใน LINE App)
 */
export function closeWindow() {
    if (!isInitialized) return;
    liff.closeWindow();
}

/**
 * ดึง OS ของ User
 */
export function getOS() {
    if (!isInitialized) return null;
    return liff.getOS();
}

/**
 * ดึง Language ของ User
 */
export function getLanguage() {
    if (!isInitialized) return null;
    return liff.getLanguage();
}

/**
 * ดึง LIFF ID
 */
export function getLiffId() {
    return LIFF_ID;
}

/**
 * ตรวจสอบว่า LIFF ถูก Configure หรือยัง
 */
export function isConfigured() {
    return !!LIFF_ID;
}

export const liffService = {
    initializeLiff,
    isLoggedIn,
    login,
    logout,
    getAccessToken,
    getProfile,
    isInClient,
    closeWindow,
    getOS,
    getLanguage,
    getLiffId,
    isConfigured
};

export default liffService;
