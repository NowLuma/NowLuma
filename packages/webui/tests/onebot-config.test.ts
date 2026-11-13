import { describe, expect, it } from 'vitest';
import { normalizeOneBotConfig } from '../src/lib/onebot-config';

describe('normalizeOneBotConfig history sync', () => {
    it('defaults older payloads to disabled', () => {
        expect(normalizeOneBotConfig({}).historySync).toEqual({ enabled: false });
    });

    it('migrates the former status trigger while keeping disabled/custom configurations', () => {
        expect(normalizeOneBotConfig({ statusCommand: { trigger: '#sl', enabled: false } }).statusCommand).toEqual({ enabled: false, swallow: false, cooldownSeconds: 5, trigger: '#nl' });
        expect(normalizeOneBotConfig({ statusCommand: { trigger: '!status', enabled: false } }).statusCommand.trigger).toBe('!status');
    });

    it('preserves an explicit per-account opt-in', () => {
        expect(
            normalizeOneBotConfig({
                historySync: { enabled: true },
            }).historySync,
        ).toEqual({ enabled: true });
    });
});
