import { describe, expect, it } from 'vitest';
import { normalizePerformanceMode, performanceModeLow } from '../src/lib/performance-mode';

describe('manual glass quality', () => {
    it('normalizes legacy automatic quality to full glass and retains explicit frosted quality', () => {
        expect(normalizePerformanceMode('auto')).toBe('high');
        expect(normalizePerformanceMode(undefined)).toBe('high');
        expect(normalizePerformanceMode('turbo')).toBe('high');
        expect(normalizePerformanceMode('high')).toBe('high');
        expect(normalizePerformanceMode('low')).toBe('low');
        expect(performanceModeLow('high')).toBe(false);
        expect(performanceModeLow('low')).toBe(true);
    });
});
