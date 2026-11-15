import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '@nowluma/common/webui-appearance';
import { persistAppearance } from '../src/appearance/persistence';

afterEach(() => vi.unstubAllGlobals());

describe('persistAppearance authentication boundary', () => {
    it('keeps pre-auth theme changes local without any fetch or POST', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        vi.stubGlobal('localStorage', {
            getItem: (key: string) =>
                key === 'nowluma_ui_appearance' ? JSON.stringify(DEFAULT_APPEARANCE) : null,
        });
        await persistAppearance(DEFAULT_APPEARANCE);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not turn a rejected expired-token save into success', async () => {
        const fetch = vi.fn(async () => ({
            ok: false,
            status: 401,
            json: async () => ({ message: 'session expired' }),
        }));
        vi.stubGlobal('fetch', fetch);
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => (key === 'nowluma_token' ? 'test-only-expired-token' : null),
        });
        await expect(persistAppearance(DEFAULT_APPEARANCE)).rejects.toThrow('session expired');
        expect(fetch).toHaveBeenCalledOnce();
        expect(fetch.mock.calls[0]).toMatchObject(['/api/ui', { method: 'POST' }]);
    });
});
