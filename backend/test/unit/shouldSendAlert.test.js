import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    shouldSendAlert,
    markAlertSent,
    resetAlertCooldown,
} from '../../src/services/peopleCountService.js';

describe('alert cooldown', () => {
    beforeEach(() => {
        resetAlertCooldown();
        vi.useRealTimers();
    });

    it('allows first alert immediately', () => {
        expect(shouldSendAlert('crowd_warning')).toBe(true);
    });

    it('blocks repeat alert within cooldown window', () => {
        vi.useFakeTimers();
        markAlertSent('crowd_warning');
        vi.advanceTimersByTime(5 * 60 * 1000);  // 5 min, less than 10-min cooldown
        expect(shouldSendAlert('crowd_warning')).toBe(false);
    });

    it('allows alert after cooldown expires', () => {
        vi.useFakeTimers();
        markAlertSent('crowd_warning');
        vi.advanceTimersByTime(11 * 60 * 1000);  // 11 min, past 10-min cooldown
        expect(shouldSendAlert('crowd_warning')).toBe(true);
    });

    it('tracks cooldown per alert type independently', () => {
        markAlertSent('crowd_warning');
        expect(shouldSendAlert('crowd_critical')).toBe(true);
    });
});
