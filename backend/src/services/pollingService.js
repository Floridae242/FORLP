// =====================================================
// Kad Kong Ta Smart Insight - Polling Service (Simplified)
// ดึงข้อมูลอัตโนมัติและ Schedule Daily Report
// - Daily Report: เสาร์-อาทิตย์ เวลา 23:00 น.
// - Early Warning: เสาร์-อาทิตย์ เวลา 14:00 น.
// =====================================================

import { config } from '../config/index.js';
import { peopleCountService } from './peopleCountService.js';
import { dailyReportService } from './dailyReportService.js';
import { earlyWarningService } from './earlyWarningService.js';

let pollingInterval = null;
let dailyReportTimeout = null;
let earlyWarningTimeout = null;
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
    
    // ตั้ง schedule สำหรับ Early Warning (เสาร์-อาทิตย์ 14:00)
    scheduleEarlyWarning();
    
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
    if (earlyWarningTimeout) {
        clearTimeout(earlyWarningTimeout);
        earlyWarningTimeout = null;
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
 * ตรวจสอบว่าเป็นวันเสาร์หรืออาทิตย์หรือไม่ (เวลาประเทศไทย)
 */
function isWeekend(date) {
    // แปลงเป็นเวลาประเทศไทย
    const thaiTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const day = thaiTime.getDay();
    return day === 0 || day === 6; // 0 = อาทิตย์, 6 = เสาร์
}

/**
 * หาวันเสาร์หรืออาทิตย์ถัดไป ตามเวลาที่กำหนด (เวลาประเทศไทย)
 */
function getNextWeekendTime(targetHour, targetMinute = 0) {
    const now = new Date();
    
    // สร้าง target date ในเวลาประเทศไทย
    let targetDate = new Date(now);
    
    // ตั้งเวลาเป็น targetHour:targetMinute (เวลาไทย = UTC+7)
    // แปลงเป็น UTC: targetHour - 7
    targetDate.setUTCHours(targetHour - 7, targetMinute, 0, 0);
    
    // ถ้าวันนี้เป็นวันหยุดและยังไม่ถึงเวลา target ให้ใช้วันนี้
    if (isWeekend(now) && now < targetDate) {
        return targetDate;
    }
    
    // หาวันเสาร์หรืออาทิตย์ถัดไป
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setUTCHours(targetHour - 7, targetMinute, 0, 0);
    
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
    const targetTime = getNextWeekendTime(23, 0); // 23:00 น. เวลาไทย
    
    const msUntilTarget = targetTime - now;
    const hoursUntil = Math.round(msUntilTarget / 1000 / 60 / 60 * 10) / 10;
    
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const thaiTargetTime = new Date(targetTime.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const targetDayName = dayNames[thaiTargetTime.getDay()];
    
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
 * ตั้งเวลาส่ง Early Warning (เฉพาะวันเสาร์-อาทิตย์ 14:00)
 */
function scheduleEarlyWarning() {
    const now = new Date();
    const targetTime = getNextWeekendTime(14, 0); // 14:00 น. เวลาไทย
    
    const msUntilTarget = targetTime - now;
    const hoursUntil = Math.round(msUntilTarget / 1000 / 60 / 60 * 10) / 10;
    
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const thaiTargetTime = new Date(targetTime.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const targetDayName = dayNames[thaiTargetTime.getDay()];
    
    console.log(`[EarlyWarning] Scheduled for วัน${targetDayName} 14:00 น. (in ${hoursUntil} hours)`);
    
    earlyWarningTimeout = setTimeout(async () => {
        console.log('[EarlyWarning] Triggering early warning check...');
        
        try {
            const result = await earlyWarningService.processEarlyWarning();
            
            if (result.success) {
                console.log(`[EarlyWarning] Completed - Action: ${result.action}`);
                if (result.action === 'sent') {
                    console.log('[EarlyWarning] Warning message sent to LINE');
                } else if (result.action === 'no_alert') {
                    console.log('[EarlyWarning] No risks detected - no alert sent');
                }
            } else {
                console.error('[EarlyWarning] Failed:', result.error);
            }
        } catch (error) {
            console.error('[EarlyWarning] Error:', error.message);
        }
        
        // Schedule อันถัดไป
        scheduleEarlyWarning();
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
 * บังคับส่ง Early Warning ทันที (ใช้ force=true เพื่อข้ามการตรวจสอบวัน)
 */
export async function forceEarlyWarning() {
    console.log('[EarlyWarning] Force check triggered');
    return await earlyWarningService.processEarlyWarning(true);
}

/**
 * ดึงสถานะ Polling Service
 */
export function getPollingStatus() {
    const nextDailyReport = getNextWeekendTime(23, 0);
    const nextEarlyWarning = getNextWeekendTime(14, 0);
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    
    const thaiDailyReport = new Date(nextDailyReport.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const thaiEarlyWarning = new Date(nextEarlyWarning.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    
    return {
        isRunning: pollingInterval !== null,
        interval: config.pollingInterval,
        // Daily Report schedule
        dailyReportScheduled: dailyReportTimeout !== null,
        dailyReportTime: 'วัน' + dayNames[thaiDailyReport.getDay()] + ' 23:00 น.',
        nextDailyReportDate: nextDailyReport.toISOString(),
        // Early Warning schedule
        earlyWarningScheduled: earlyWarningTimeout !== null,
        earlyWarningTime: 'วัน' + dayNames[thaiEarlyWarning.getDay()] + ' 14:00 น.',
        nextEarlyWarningDate: nextEarlyWarning.toISOString()
    };
}

export const pollingService = {
    startPolling,
    stopPolling,
    forcePoll,
    forceDailyReport,
    forceEarlyWarning,
    getPollingStatus
};

export default pollingService;
