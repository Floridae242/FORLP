import { describe, it, expect } from 'vitest';
import { getPool } from '../src/db/index.js';

describe('test harness', () => {
    it('points search_path at forlp_test', async () => {
        const { rows } = await getPool().query('SHOW search_path');
        expect(rows[0].search_path).toBe('forlp_test, public');
    });

    it('can see test-schema tables', async () => {
        const { rows } = await getPool().query(`
            SELECT tablename FROM pg_tables WHERE schemaname = 'forlp_test' ORDER BY tablename
        `);
        const names = rows.map((r) => r.tablename);
        expect(names).toContain('people_counts');
        expect(names).toContain('users');
        expect(names).toContain('zone_estimates');
    });
});
