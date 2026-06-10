import { describe, it, expect, vi } from 'vitest';
import { getPool, queries } from '../../src/db/index.js';

// Mock the weather wrapper so we don't hit OpenWeather in tests
vi.mock('../../src/services/weatherService.js', () => ({
    weatherService: {
        getCurrentWeather: async () => ({ success: true, data: { description: 'mock', temperature: 25, humidity: 60 } }),
        getAirQuality: async () => ({ success: true, data: { components: { pm2_5: { value: 10 } } } }),
    },
}));

import { generateDailyReport } from '../../src/services/dailyReportService.js';

describe('dailyReportService.generateDailyReport', () => {
    it('persists non-zero max_people when source data exists', async () => {
        // Arrange — three rows for 2026-06-08 with varied counts
        await getPool().query(`
            INSERT INTO people_counts (count, recorded_at, source) VALUES
                (50, '2026-06-08 10:00:00+00', 'test'),
                (200, '2026-06-08 12:00:00+00', 'test'),
                (120, '2026-06-08 14:00:00+00', 'test')
        `);

        // Act
        const result = await generateDailyReport('2026-06-08');

        // Assert — function should report success
        expect(result.success).toBe(true);
        expect(result.data.max_people).toBe(200);
        expect(result.data.avg_people).toBeCloseTo(123.3, 1);

        // Assert — the saved daily_reports row also has non-zero values
        const { rows } = await getPool().query(
            `SELECT max_people, avg_people, min_people, total_samples
             FROM daily_reports WHERE report_date = '2026-06-08'`
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].max_people).toBe(200);
        expect(rows[0].avg_people).toBeCloseTo(123.3, 1);
        expect(rows[0].total_samples).toBe(3);
    });

    it('returns success with zero max_people when no source data exists', async () => {
        const result = await generateDailyReport('2026-01-01');
        expect(result.success).toBe(true);
        expect(result.data.max_people).toBe(0);
    });
});

describe('queries.isReportSentLine', () => {
    it('returns false for an unsaved date', async () => {
        expect(await queries.isReportSentLine('2026-03-15')).toBe(false);
    });

    it('returns false for a saved-but-not-marked date, true after marking', async () => {
        await queries.saveDailyReport({
            report_date: '2026-03-15',
            max_people: 100,
            avg_people: 50,
            min_people: 10,
            total_samples: 5,
        });
        expect(await queries.isReportSentLine('2026-03-15')).toBe(false);

        await queries.markReportSentLine('2026-03-15');
        expect(await queries.isReportSentLine('2026-03-15')).toBe(true);
    });
});
