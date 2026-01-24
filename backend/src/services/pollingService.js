// =====================================================
// Kad Kong Ta Smart Insight - Polling Service (Simplified)
// ดึงข้อมูลอัตโนมัติและ Schedule Daily Report
// ส่ง LINE เฉพาะวันเสาร์-อาทิตย์ เวลา 23:00 น.
// =====================================================

import { config } from '../config/index.js';
import { peopleCountService } from './peopleCountService.js';
import { dailyReportService } from './dailyReportService.js';

let pollingInterval = null;
let dailyReportTimeout = null;
let isPolling = false;

/**
 * เริ่ม Polling Service
 */
export function startPolling() {
    if (pollingInterval) {
        console.log('[Polling] Already running');
        return;
    }
    
    console.log(`[Polling] Starting with interval ${config.pollingInterval / 1000}s`);
    
    // ดึงข้อมูลครั้งแรกทันที
    pollData();
    
    // ตั้ง interval สำหรับดึงข้อมูล
    pollingInterval = setInterval(pollData, config.pollingInterval);
    
    // ตั้ง schedule สำหรับ Daily Report (เสาร์-อาทิตย์ 23:00)
    scheduleDailyReport();
    
    console.log('[Polling] Service started');
}

/**
 * หยุด Polling Service
 */
export function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    if (dailyReportTimeout) {
        clearTimeout(dailyReportTimeout);
        dailyReportTimeout = null;
    }
    console.log('[Polling] Service stopped');
}

/**
 * ดึงข้อมูลและบันทึก
 */
async function pollData() {
    if (isPolling) {
        console.log('[Polling] Skip - previous poll still running');
        return;
    }
    
    isPolling = true;
    
    try {
        // ดึงข้อมูลจำนวนคน
        const peopleCounts = await peopleCountService.fetchPeopleCounts();
        
        // บันทึกลง Database
        if (peopleCounts && peopleCounts.length > 0) {
            peopleCountService.savePeopleCounts(peopleCounts);
            
            if (config.nodeEnv === 'development') {
                const total = peopleCounts.reduce((sum, z) => sum + z.people_count, 0);
                console.log(`[Polling] Saved people counts - Total: ${total}`);
            }
        }
    } catch (error) {
        console.error('[Polling] Error:', error.message);
    } finally {
        isPolling = false;
    }
}

/**
 * ตรวจสอบว่าเป็นวันเสาร์หรืออาทิตย์หรือไม่
 */
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = อาทิตย์, 6 = เสาร์
}

/**
 * หาวันเสาร์หรืออาทิตย์ถัดไป เวลา 23:00
 */
function getNextWeekendReportTime() {
    const now = new Date();
    const targetHour = 23;
    const targetMinute = 0;
    
    // เริ่มจากวันนี้
    let targetDate = new Date(now);
    targetDate.setHours(targetHour, targetMinute, 0, 0);
    
    // ถ้าวันนี้เป็นวันหยุดและยังไม่ถึงเวลา 23:00 ให้ใช้วันนี้
    if (isWeekend(now) && now < targetDate) {
        return targetDate;
    }
    
    // หาวันเสาร์หรืออาทิตย์ถัดไป
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(targetHour, targetMinute, 0, 0);
    
    while (!isWeekend(targetDate)) {
        targetDate.setDate(targetDate.getDate() + 1);
    }
    
    return targetDate;
}

/**
 * ตั้งเวลาส่ง Daily Report (เฉพาะวันเสาร์-อาทิตย์ 23:00)
 */
function scheduleDailyReport() {
    const now = new Date();
    const targetTime = getNextWeekendReportTime();
    
    const msUntilTarget = targetTime - now;
    const hoursUntil = Math.round(msUntilTarget / 1000 / 60 / 60 * 10) / 10;
    
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const targetDayName = dayNames[targetTime.getDay()];
    
    console.log(`[DailyReport] Scheduled for วัน${targetDayName} 23:00 น. (in ${hoursUntil} hours)`);
    
    dailyReportTimeout = setTimeout(async () => {
        console.log('[DailyReport] Triggering weekend report...');
        
        try {
            const result = await dailyReportService.processAndSendDailyReport();
            
            if (result.success) {
                console.log('[DailyReport] Successfully sent');
            } else {
                console.error('[DailyReport] Failed:', result.error || result.message);
            }
        } catch (error) {
            console.error('[DailyReport] Error:', error.message);
        }
        
        // Schedule อันถัดไป
        scheduleDailyReport();
    }, msUntilTarget);
}

/**
 * บังคับดึงข้อมูลทันที
 */
export async function forcePoll() {
    console.log('[Polling] Force poll triggered');
    await pollData();
}

/**
 * บังคับส่ง Daily Report ทันที
 */
export async function forceDailyReport(date = null) {
    console.log('[DailyReport] Force send triggered');
    return await dailyReportService.processAndSendDailyReport(date);
}

/**
 * ดึงสถานะ Polling Service
 */
export function getPollingStatus() {
    const nextReport = getNextWeekendReportTime();
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    
    return {
        isRunning: pollingInterval !== null,
        interval: config.pollingInterval,
        dailyReportScheduled: dailyReportTimeout !== null,
        dailyReportTime: 'วัน' + dayNames[nextReport.getDay()] + ' 23:00 น.',
        nextReportDate: nextReport.toISOString()
    };
}

export const pollingService = {
    startPolling,
    stopPolling,
    forcePoll,
    forceDailyReport,
    getPollingStatus
};

export default pollingService;
