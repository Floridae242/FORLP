import { describe, it, expect } from 'vitest';
import { calculateStatus } from '../../src/services/peopleCountService.js';

describe('calculateStatus thresholds', () => {
    it.each([
        [0, 'normal'],
        [500, 'normal'],
        [501, 'moderate'],
        [1200, 'moderate'],
        [1201, 'busy'],
        [2500, 'busy'],
        [2501, 'crowded'],
        [9999, 'crowded'],
    ])('count=%i → status=%s', (count, expectedKey) => {
        expect(calculateStatus(count).key).toBe(expectedKey);
    });
});
