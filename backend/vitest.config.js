import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./test/helpers/setup.js'],
        testTimeout: 15_000,
        hookTimeout: 30_000,
        // Vitest 4: poolOptions removed; top-level fileParallelism controls
        // file-level concurrency. We share a single pg pool across all test
        // files (set up in beforeAll), so files MUST run serially to avoid
        // TRUNCATE deadlocks and data races between files.
        pool: 'forks',
        fileParallelism: false,
    },
});
