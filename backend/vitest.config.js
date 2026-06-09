import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./test/helpers/setup.js'],
        testTimeout: 15_000,
        hookTimeout: 30_000,
        pool: 'threads',
        poolOptions: {
            threads: {
                singleThread: true,
            },
        },
    },
});
