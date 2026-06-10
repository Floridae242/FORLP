import { describe, it, expect } from 'vitest';
import { zoneStatusFromCount } from '../../src/services/zoneStatus.js';

describe('zoneStatusFromCount', () => {
    it.each([
        [0, 'normal'],
        [500, 'normal'],
        [501, 'moderate'],
        [1200, 'moderate'],
        [1201, 'busy'],
        [2500, 'busy'],
        [2501, 'crowded'],
    ])('count=%i → crowd_level=%s', (count, expected) => {
        expect(zoneStatusFromCount(count).crowd_level).toBe(expected);
    });

    it('returns Thai labels in each band', () => {
        expect(zoneStatusFromCount(0).crowd_label).toBe('เบาบาง');
        expect(zoneStatusFromCount(700).crowd_label).toBe('ปกติ');
        expect(zoneStatusFromCount(1500).crowd_label).toBe('ค่อนข้างแออัด');
        expect(zoneStatusFromCount(3000).crowd_label).toBe('แออัด');
    });
});
