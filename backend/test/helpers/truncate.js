import { getPool } from '../../src/db/index.js';

const TABLES = [
    'users', 'user_sessions', 'user_line_tokens', 'officer_tokens',
    'people_counts', 'daily_reports', 'line_broadcast_logs', 'system_settings',
    'ai_people_counts', 'ai_camera_status', 'crowd_alerts', 'zone_estimates',
];

export async function truncateAll() {
    if (process.env.PGSCHEMA !== 'forlp_test') {
        throw new Error(`truncateAll: refusing to run with PGSCHEMA=${process.env.PGSCHEMA}`);
    }
    const tables = TABLES.map((t) => `forlp_test.${t}`).join(', ');
    await getPool().query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
