import pkg from 'pg';
const { Pool, types } = pkg;
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// PG returns BIGINT/NUMERIC as strings and DATE as JS Date by default.
// The frontend expects plain JS numbers and YYYY-MM-DD strings.
// 20 = INT8/BIGINT (used by COUNT, SUM), 1700 = NUMERIC (used by ROUND, AVG)
// 1082 = DATE — return as-is from the wire (YYYY-MM-DD).
types.setTypeParser(20, (v) => v === null ? null : parseInt(v, 10));
types.setTypeParser(1700, (v) => v === null ? null : parseFloat(v));
types.setTypeParser(1082, (v) => v);

let pool = null;

function resolveConnectionString() {
    const base = process.env.DATABASE_URL;
    if (!base) return base;
    const schema = process.env.PGSCHEMA;
    if (!schema) return base;
    const sep = base.includes('?') ? '&' : '?';
    // libpq treats unescaped spaces in `options` as parameter separators,
    // so escape the space inside the search_path value with a backslash.
    return `${base}${sep}options=${encodeURIComponent(`-c search_path=${schema},\\ public`)}`;
}

export function getPool() {
    if (!pool) throw new Error('Database not initialized');
    return pool;
}

// Convenience helpers — used throughout services
export async function query(sql, params = []) {
    const { rows } = await getPool().query(sql, params);
    return rows;
}

export async function queryOne(sql, params = []) {
    const { rows } = await getPool().query(sql, params);
    return rows[0] ?? null;
}

export async function execute(sql, params = []) {
    return getPool().query(sql, params);
}

export async function transaction(fn) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export async function initDatabase() {
    pool = new Pool({
        connectionString: resolveConnectionString(),
        ssl: process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : (process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false),
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });

    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
        console.log('✓ Database connected (PostgreSQL/Supabase)');
    } finally {
        client.release();
    }

    // Run schema (all CREATE IF NOT EXISTS — safe to re-run)
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    const stmts = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of stmts) {
        try { await pool.query(stmt); } catch (e) {
            // Log but don't crash on non-critical index failures
            if (!e.message.includes('already exists')) {
                console.warn('[DB] Schema warning:', e.message.slice(0, 80));
            }
        }
    }
    console.log('✓ Database schema ready');
    return pool;
}

// Named query helpers used by route handlers
export const queries = {
    // ==================== ZONE ESTIMATES ====================
    getZoneEstimates: async () => {
        const rows = await query('SELECT * FROM zone_estimates ORDER BY zone_code');
        if (rows.length === 0) {
            return [
                { zone_code: 'A', percentage: 60, updated_by: null, updated_at: null },
                { zone_code: 'B', percentage: 30, updated_by: null, updated_at: null },
                { zone_code: 'C', percentage: 10, updated_by: null, updated_at: null },
            ];
        }
        return rows;
    },

    updateZoneEstimates: async (percentages, updatedBy) => {
        const now = new Date().toISOString();
        await transaction(async (client) => {
            for (const [code, pct] of Object.entries(percentages)) {
                await client.query(
                    `INSERT INTO zone_estimates (zone_code, percentage, updated_by, updated_at)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (zone_code) DO UPDATE
                     SET percentage = $2, updated_by = $3, updated_at = $4`,
                    [code, pct, updatedBy, now]
                );
            }
        });
        return now;
    },

    // ==================== DAILY REPORTS ====================
    saveDailyReport: async (data) => {
        return execute(
            `INSERT INTO daily_reports
             (report_date, max_people, avg_people, min_people, total_samples,
              weather_summary, temperature_avg, humidity_avg, pm25_avg, pm25_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (report_date) DO UPDATE SET
               max_people=$2, avg_people=$3, min_people=$4, total_samples=$5,
               weather_summary=$6, temperature_avg=$7, humidity_avg=$8,
               pm25_avg=$9, pm25_status=$10`,
            [
                data.report_date,
                data.max_people || 0, data.avg_people || 0,
                data.min_people || 0, data.total_samples || 0,
                data.weather_summary || null, data.temperature_avg || null,
                data.humidity_avg || null, data.pm25_avg || null,
                data.pm25_status || null,
            ]
        );
    },

    getDailyReport: async (date) =>
        queryOne('SELECT * FROM daily_reports WHERE report_date = $1', [date]),

    getLatestDailyReport: async () =>
        queryOne('SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT 1'),

    getDailyReports: async (limit = 7) =>
        query('SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT $1', [limit]),

    markReportSentLine: async (date) =>
        execute(
            `UPDATE daily_reports SET is_sent_line = 1, sent_line_at = NOW() WHERE report_date = $1`,
            [date]
        ),

    isReportSentLine: async (date) => {
        const row = await queryOne('SELECT is_sent_line FROM daily_reports WHERE report_date = $1', [date]);
        return row?.is_sent_line === 1;
    },

    // ==================== LINE BROADCAST LOGS ====================
    logLineBroadcast: async (data) =>
        execute(
            `INSERT INTO line_broadcast_logs (report_date, message_content, status, error_message)
             VALUES ($1,$2,$3,$4)`,
            [data.report_date, data.message_content, data.status, data.error_message]
        ),

    updateLineBroadcastStatus: async (id, status, errorMessage = null) =>
        execute(
            'UPDATE line_broadcast_logs SET status=$1, error_message=$2 WHERE id=$3',
            [status, errorMessage, id]
        ),

    // ==================== SYSTEM SETTINGS ====================
    getSetting: async (key) => {
        const row = await queryOne('SELECT setting_value FROM system_settings WHERE setting_key = $1', [key]);
        return row?.setting_value;
    },

    setSetting: async (key, value) =>
        execute(
            `INSERT INTO system_settings (setting_key, setting_value, updated_at)
             VALUES ($1,$2,NOW())
             ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
            [key, value]
        ),

    getAllSettings: async () =>
        query('SELECT * FROM system_settings'),

    // ==================== CLEANUP ====================
    cleanupOldData: async (daysToKeep = 30) => {
        const r1 = await execute(
            `DELETE FROM people_counts WHERE recorded_at < NOW() - ($1 || ' days')::interval`,
            [daysToKeep]
        );
        const r2 = await execute(
            `DELETE FROM line_broadcast_logs WHERE created_at < NOW() - ($1 || ' days')::interval`,
            [daysToKeep]
        );
        return {
            people_counts_deleted: r1.rowCount,
            line_logs_deleted: r2.rowCount,
        };
    },
};
