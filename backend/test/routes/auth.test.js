import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';

describe('POST /api/auth/line/callback', () => {
    it('returns 400 when state is missing', async () => {
        const res = await request(app)
            .post('/api/auth/line/callback')
            .send({ code: 'abc' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('returns 400 when code is missing', async () => {
        const res = await request(app)
            .post('/api/auth/line/callback')
            .send({ state: 'abc' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('returns 400 when state is unknown (CSRF protection)', async () => {
        const res = await request(app)
            .post('/api/auth/line/callback')
            .send({ code: 'abc', state: 'never-issued' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toMatch(/หมดอายุ|ลองเข้าสู่ระบบใหม่/);
    });
});
