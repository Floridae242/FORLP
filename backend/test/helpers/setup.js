import { beforeAll, afterAll, beforeEach } from 'vitest';
import { ensureTestSchema } from './schema.js';
import { truncateAll } from './truncate.js';
import { initDatabase, getPool } from '../../src/db/index.js';

beforeAll(async () => {
    await ensureTestSchema();
    await initDatabase();
    await truncateAll();
});

beforeEach(async () => {
    await truncateAll();
});

afterAll(async () => {
    await getPool().end();
});
