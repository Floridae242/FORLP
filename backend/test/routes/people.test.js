import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { getPool } from '../../src/db/index.js';

describe('GET /api/people/daily', () => {
    it('returns YYYY-MM-DD date string and numeric counts (not pg-typed strings)', async () => {
        await getPool().query(`
            INSERT INTO people_counts (count, recorded_at, source) VALUES
                (50, '2026-06-08 10:00:00+00', 'test'),
                (200, '2026-06-08 12:00:00+00', 'test'),
                (120, '2026-06-08 14:00:00+00', 'test')
        `);

        const res = await request(app).get('/api/people/daily?date=2026-06-08');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const d = res.body.data;
        // Date is a plain YYYY-MM-DD string, not an ISO timestamp
        expect(d.date).toBe('2026-06-08');
        // Counts are numbers, not strings
        expect(typeof d.max_people).toBe('number');
        expect(typeof d.avg_people).toBe('number');
        expect(typeof d.min_people).toBe('number');
        expect(typeof d.total_samples).toBe('number');
        expect(d.max_people).toBe(200);
        expect(d.total_samples).toBe(3);
    });

    it('returns zeros when no rows exist for the date', async () => {
        const res = await request(app).get('/api/people/daily?date=2026-01-01');
        expect(res.status).toBe(200);
        expect(res.body.data.max_people).toBe(0);
        expect(res.body.data.total_samples).toBe(0);
    });
});
