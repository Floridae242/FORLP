import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;

export function getDb() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}

export async function initDatabase() {
    const dbDir = dirname(config.dbPath);
    if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');

    // Check if we need to migrate (check for message_type column)
    try {
        const tableInfo = db.prepare("PRAGMA table_info(line_broadcast_logs)").all();
        const hasMessageType = tableInfo.some(col => col.name === 'message_type');
        
        if (tableInfo.length > 0 && !hasMessageType) {
            console.log('Migrating database schema...');
            // Add missing column to existing table
            db.exec('ALTER TABLE line_broadcast_logs ADD COLUMN message_type TEXT DEFAULT "daily_report"');
            console.log('✓ Added message_type column');
        }
    } catch (e) {
        // Table doesn't exist yet, will be created by schema
        console.log('Creating new database...');
    }

    // Execute schema (CREATE IF NOT EXISTS is safe)
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    console.log('✓ Database schema initialized');
    return db;
}

export const queries = {
    // ==================== ZONES ====================
    getAllZones: () => {
        return getDb().prepare('SELECT * FROM zones WHERE is_active = 1').all();
    },

    getZoneByCode: (zoneCode) => {
        return getDb().prepare('SELECT * FROM zones WHERE zone_code = ?').get(zoneCode);
    },

    // ==================== PEOPLE COUNTS ====================
    insertPeopleCount: (zoneCode, peopleCount, recordedAt = null) => {
        const stmt = getDb().prepare(`
            INSERT INTO people_counts (zone_code, people_count, recorded_at)
            VALUES (?, ?, ?)
        `);
        return stmt.run(zoneCode, peopleCount, recordedAt || new Date().toISOString());
    },

    // บันทึกหลาย Zone พร้อมกัน
    insertPeopleCounts: (data) => {
        const stmt = getDb().prepare(`
            INSERT INTO people_counts (zone_code, people_count, recorded_at)
            VALUES (@zone_code, @people_count, @recorded_at)
        `);
        const insertMany = getDb().transaction((items) => {
            for (const item of items) {
                stmt.run({
                    zone_code: item.zone_code,
                    people_count: item.people_count,
                    recorded_at: item.recorded_at || new Date().toISOString()
                });
            }
        });
        insertMany(data);
    },

    // ดึงข้อมูลล่าสุดของแต่ละ Zone
    getLatestPeopleCounts: () => {
        return getDb().prepare(`
            SELECT pc.*, z.zone_name, z.capacity
            FROM people_counts pc
            INNER JOIN zones z ON pc.zone_code = z.zone_code
            INNER JOIN (
                SELECT zone_code, MAX(recorded_at) as max_ts
                FROM people_counts
                GROUP BY zone_code
            ) latest ON pc.zone_code = latest.zone_code AND pc.recorded_at = latest.max_ts
            ORDER BY pc.zone_code
        `).all();
    },

    // ดึงข้อมูลตามช่วงเวลา
    getPeopleCountsByRange: (from, to) => {
        return getDb().prepare(`
            SELECT pc.*, z.zone_name
            FROM people_counts pc
            INNER JOIN zones z ON pc.zone_code = z.zone_code
            WHERE pc.recorded_at >= ? AND pc.recorded_at <= ?
            ORDER BY pc.recorded_at DESC
        `).all(from, to);
    },

    // สรุปจำนวนคนแต่ละ Zone ในวันนั้น
    getDailyPeopleSummary: (date) => {
        const startOfDay = `${date}T00:00:00`;
        const endOfDay = `${date}T23:59:59`;
        
        return getDb().prepare(`
            SELECT 
                zone_code,
                SUM(people_count) as total_count,
                MAX(people_count) as peak_count,
                AVG(people_count) as avg_count,
                COUNT(*) as record_count
            FROM people_counts
            WHERE recorded_at >= ? AND recorded_at <= ?
            GROUP BY zone_code
            ORDER BY zone_code
        `).all(startOfDay, endOfDay);
    },

    // ==================== DAILY REPORTS ====================
    createDailyReport: (data) => {
        const stmt = getDb().prepare(`
            INSERT OR REPLACE INTO daily_reports 
            (report_date, zone_a_total, zone_a_peak, zone_b_total, zone_b_peak, 
             zone_c_total, zone_c_peak, weather_summary, temperature_avg, 
             pm25_avg, pm25_max, pm25_level)
            VALUES (@report_date, @zone_a_total, @zone_a_peak, @zone_b_total, @zone_b_peak,
                    @zone_c_total, @zone_c_peak, @weather_summary, @temperature_avg,
                    @pm25_avg, @pm25_max, @pm25_level)
        `);
        return stmt.run(data);
    },

    // ดึงรายงานประจำวัน
    getDailyReport: (date) => {
        return getDb().prepare('SELECT * FROM daily_reports WHERE report_date = ?').get(date);
    },

    // ดึงรายงานล่าสุด
    getLatestDailyReport: () => {
        return getDb().prepare('SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT 1').get();
    },

    // ดึงรายงานย้อนหลัง
    getDailyReports: (limit = 7) => {
        return getDb().prepare('SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT ?').all(limit);
    },

    // อัพเดทสถานะการส่ง LINE
    markReportSentLine: (date) => {
        return getDb().prepare(`
            UPDATE daily_reports 
            SET is_sent_line = 1, sent_line_at = datetime('now')
            WHERE report_date = ?
        `).run(date);
    },

    // ตรวจสอบว่าส่ง LINE แล้วหรือยัง
    isReportSentLine: (date) => {
        const result = getDb().prepare('SELECT is_sent_line FROM daily_reports WHERE report_date = ?').get(date);
        return result?.is_sent_line === 1;
    },

    // ==================== LINE BROADCAST LOGS ====================
    logLineBroadcast: (data) => {
        const stmt = getDb().prepare(`
            INSERT INTO line_broadcast_logs (report_date, message_content, status, error_message)
            VALUES (@report_date, @message_content, @status, @error_message)
        `);
        return stmt.run(data);
    },

    updateLineBroadcastStatus: (id, status, errorMessage = null) => {
        return getDb().prepare(`
            UPDATE line_broadcast_logs SET status = ?, error_message = ? WHERE id = ?
        `).run(status, errorMessage, id);
    },

    // ==================== SYSTEM SETTINGS ====================
    getSetting: (key) => {
        const result = getDb().prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?').get(key);
        return result?.setting_value;
    },

    setSetting: (key, value) => {
        return getDb().prepare(`
            INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at)
            VALUES (?, ?, datetime('now'))
        `).run(key, value);
    },

    getAllSettings: () => {
        return getDb().prepare('SELECT * FROM system_settings').all();
    },

    // ==================== UTILITY ====================
    // ลบข้อมูลเก่า (เก็บแค่ 30 วัน)
    cleanupOldData: (daysToKeep = 30) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffStr = cutoffDate.toISOString();

        const result1 = getDb().prepare('DELETE FROM people_counts WHERE recorded_at < ?').run(cutoffStr);
        const result2 = getDb().prepare('DELETE FROM line_broadcast_logs WHERE created_at < ?').run(cutoffStr);

        return {
            people_counts_deleted: result1.changes,
            line_logs_deleted: result2.changes
        };
    }
};
