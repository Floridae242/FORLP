// =====================================================
// กาดกองต้า Smart Insight — ค่าคงที่สำหรับ Frontend
// =====================================================

export const CROWD_THRESHOLDS = {
    CROWDED:  2501,
    BUSY:     1201,
    MODERATE:  501,
};

export const CROWD_COLORS = {
    crowded:  '#ef4444',
    busy:     '#f97316',
    moderate: '#f59e0b',
    normal:   '#22c55e',
    unknown:  '#6b7280',
};

export const CROWD_OPACITY = {
    crowded:  0.70,
    busy:     0.55,
    moderate: 0.45,
    normal:   0.35,
    unknown:  0.25,
};

export const ZONE_DEFAULTS = { A: 60, B: 30, C: 10 };
export const ZONE_PERCENTAGE_TOLERANCE = 0.5;

export const ZONE_NAMES = {
    A: 'สะพานรัษฎา',
    B: 'ถนนคนเดิน',
    C: 'ตลาดเก่า',
};

export const PM25_STANDARDS = { WHO: 15, THAI: 37.5 };

export const SESSION_KEYS = {
    TOKEN:   'forlp_session_token',
    EXPIRES: 'forlp_session_expires',
    USER:    'forlp_user_cache',
};

export const POLL_INTERVALS = {
    ZONE_HEATMAP_MS:   60_000,
    PEOPLE_PAGE_MS:    30_000,
};

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://forlp.onrender.com';
