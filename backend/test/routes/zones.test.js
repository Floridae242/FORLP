import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { queries } from '../../src/db/index.js';

describe('zone estimates round-trip', () => {
    it('GET /api/zones/current reflects writes from updateZoneEstimates', async () => {
        await queries.updateZoneEstimates({ A: 55, B: 35, C: 10 }, 'test-officer');

        const res = await request(app).get('/api/zones/current');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const zones = res.body.data.zones;
        const byCode = Object.fromEntries(zones.map((z) => [z.zone_code, z]));
        expect(byCode.A.percentage).toBe(55);
        expect(byCode.B.percentage).toBe(35);
        expect(byCode.C.percentage).toBe(10);
        expect(res.body.data.updated_by).toBe('test-officer');
    });

    it('defaults zones to 60/30/10 when no overrides exist', async () => {
        const res = await request(app).get('/api/zones/current');
        const byCode = Object.fromEntries(res.body.data.zones.map((z) => [z.zone_code, z]));
        expect(byCode.A.percentage).toBe(60);
        expect(byCode.B.percentage).toBe(30);
        expect(byCode.C.percentage).toBe(10);
    });
});
