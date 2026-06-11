/* =====================================================
   IOC Service — ดึงข้อมูลจริงจาก Lampang Smart City IOC
   (iocpiramid.com) เพื่อใช้สถานะกล้องจริงในระบบ

   ใช้เฉพาะ endpoint uptimekuma/cctv ซึ่งคืนสถานะ online/offline
   ตามรหัสกล้อง — ไม่ดึง RTSP/credentials จาก IOC
   credentials ของ IOC มาจาก environment variables เท่านั้น
   ===================================================== */

const IOC_BASE = process.env.IOC_BASE_URL || 'https://iocpiramid.com';
const IOC_USER = process.env.IOC_USERNAME || '';
const IOC_PASS = process.env.IOC_PASSWORD || '';

const SESSION_TTL_MS = 30 * 60 * 1000; // re-login ทุก 30 นาที

let session = null; // { cookie, expires }

async function login() {
    if (!IOC_USER || !IOC_PASS) {
        throw new Error('IOC credentials not configured (IOC_USERNAME / IOC_PASSWORD)');
    }
    const res = await fetch(`${IOC_BASE}/api/v1/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: IOC_USER, password: IOC_PASS }),
    });
    if (!res.ok) throw new Error(`IOC login failed: ${res.status}`);

    const setCookie = res.headers.get('set-cookie') || '';
    const match = setCookie.match(/sessionId=[^;]+/);
    if (!match) throw new Error('IOC login: session cookie missing');

    session = { cookie: match[0], expires: Date.now() + SESSION_TTL_MS };
    return session.cookie;
}

async function authedGet(path) {
    let cookie = session && session.expires > Date.now() ? session.cookie : await login();

    let res = await fetch(`${IOC_BASE}${path}`, { headers: { Cookie: cookie } });
    if (res.status === 401) {
        cookie = await login(); // session หมดอายุ — login ใหม่ครั้งเดียว
        res = await fetch(`${IOC_BASE}${path}`, { headers: { Cookie: cookie } });
    }
    if (!res.ok) throw new Error(`IOC ${path} -> ${res.status}`);
    return res.json();
}

/**
 * ดึงสถานะ online/offline ของกล้อง CCTV จาก IOC
 * @returns {Promise<Map<string, 'online'|'offline'>>} key = รหัสกล้อง เช่น "LPG-A01-CC-01"
 */
export async function fetchCctvStatus() {
    const body = await authedGet('/api/v1/report/uptimekuma/cctv');
    const list = Array.isArray(body?.data) ? body.data : [];
    const statusByCode = new Map();
    for (const item of list) {
        if (item?.name) {
            statusByCode.set(item.name.trim(), item.status === 1 ? 'online' : 'offline');
        }
    }
    return statusByCode;
}

export function isIocConfigured() {
    return Boolean(IOC_USER && IOC_PASS);
}

export default { fetchCctvStatus, isIocConfigured };
