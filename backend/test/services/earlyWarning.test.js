import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPool } from '../../src/db/index.js';

// The plan suggested partial-mocking the module to swap `sendDailyReport`.
// That doesn't work in Vitest 4 for self-mocks: `processDailyReport` calls
// the local `sendDailyReport` binding, not the module export, so swapping
// the export has no effect (the call still hits the real implementation,
// which then logs "LINE sender not configured" and returns success: false).
//
// Instead, we intercept at the documented LINE boundary: `setLineMessageSender`.
// That is the seam the production code uses (src/index.js wires the real LINE
// sender there) and the only stable spot for offline tests.
//
// We also need the weather fetch stubbed. `getHourlyForecast` lives inside
// the same module as `processDailyReport` — same self-mock problem — but
// `processDailyReport` already wraps the weather call in try/catch and
// continues on failure, so we let the real fetch fail offline rather than
// trying to intercept it. The weather fields are not what we're asserting.

import {
    setLineMessageSender,
    processDailyReport,
} from '../../src/services/earlyWarningService.js';

const lineSenderMock = vi.fn().mockResolvedValue({ success: true });

beforeEach(() => {
    lineSenderMock.mockClear();
    setLineMessageSender(lineSenderMock);
});

describe('earlyWarningService.processDailyReport', () => {
    it('reads non-zero max_people from people_counts on a Saturday', async () => {
        // 2026-06-06 is a Saturday. Seed two rows.
        await getPool().query(`
            INSERT INTO people_counts (count, recorded_at, source) VALUES
                (300, '2026-06-06 10:00:00+00', 'test'),
                (800, '2026-06-06 12:00:00+00', 'test')
        `);

        const result = await processDailyReport('2026-06-06');

        // Function should not early-exit (this would've been the silent bug)
        expect(result.success).toBe(true);

        // LINE sender should have been called exactly once with the rendered report
        expect(lineSenderMock).toHaveBeenCalledTimes(1);
        const message = lineSenderMock.mock.calls[0][0];
        expect(typeof message).toBe('string');

        // The rendered message must contain the non-zero counts from the seeded rows.
        // 800 = max, 550 = avg of (300, 800). Both go through toLocaleString().
        // We assert on the raw numeric substrings — if the silent-zero bug ever
        // returns, max_people would render as "0" and these would fail.
        expect(message).toContain('800');
        expect(message).toContain('550');
        // Total samples = 2 (two rows seeded)
        expect(message).toMatch(/จำนวนตัวอย่าง: 2 /);
        // Date should be rendered (Thai format includes "มิ.ย." for June)
        expect(message).toMatch(/มิ\.ย\.|June|6\b/);
    });

    it('skips weekdays', async () => {
        const result = await processDailyReport('2026-06-08');  // Monday
        expect(result.success).toBe(false);
        expect(result.reason).toBe('not_weekend');
        expect(lineSenderMock).not.toHaveBeenCalled();
    });
});
