import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '@nowluma/common/webui-appearance';
import { fetchAppearance, persistAppearance, readCache } from '../src/appearance/persistence';

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

describe('manual appearance migration and confirmed saves', () => {
    it.each(['auto', 'low'] as const)(
        'normalizes cached %s quality without dropping unrelated saved preferences or writing it back',
        (performanceMode) => {
            const saved = {
                ...DEFAULT_APPEARANCE,
                performanceMode,
                autoLow: true,
                disableMotion: true,
                reduceMotion: true,
                mode: 'dark',
                palette: 'nord',
                accentPreset: 'violet',
                customPointerSystem: true,
                customCss: 'body { color: inherit; }',
                cssVars: { '--primary': '#234567' },
                background: { ...DEFAULT_APPEARANCE.background, type: 'solid', color: '#123456' },
            };
            const raw = JSON.stringify(saved);
            const setItem = vi.fn();
            vi.stubGlobal('localStorage', { getItem: () => raw, setItem });
            const migrated = readCache();
            const preferences = { ...saved };
            Reflect.deleteProperty(preferences, 'autoLow');
            expect(migrated).toEqual({
                ...preferences,
                performanceMode: performanceMode === 'low' ? 'low' : 'high',
            });
            expect(migrated).not.toHaveProperty('autoLow');
            expect(setItem).not.toHaveBeenCalled();
        },
    );

    it('normalizes the authenticated server appearance at the same cache boundary', async () => {
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => key === 'nowluma_token' ? 'fixture-session' : null,
        });
        const fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                config: {
                    appearance: {
                        ...DEFAULT_APPEARANCE,
                        performanceMode: 'auto',
                        disableMotion: true,
                        autoLow: true,
                        accentPreset: 'rose',
                    },
                },
            }),
        }));
        vi.stubGlobal('fetch', fetch);
        const appearance = await fetchAppearance(true);
        expect(appearance).toMatchObject({
            performanceMode: 'high',
            disableMotion: true,
            accentPreset: 'rose',
        });
        expect(appearance).not.toHaveProperty('autoLow');
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('never falls back to public defaults for a full authenticated read before saving', async () => {
        vi.stubGlobal('localStorage', { getItem: () => 'fixture-session' });
        const fetch = vi.fn(async () => ({ ok: false, status: 503 }));
        vi.stubGlobal('fetch', fetch);
        expect(await fetchAppearance(true)).toBeNull();
        expect(fetch).toHaveBeenCalledOnce();
        expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('/api/ui');
    });

    it('discards appearance read responses belonging to a replaced session', async () => {
        let token = 'fixture-old-session';
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => key === 'nowluma_token' ? token : null,
        });
        const fetch = vi.fn(async () => ({
            ok: true,
            json: async () => {
                token = 'fixture-new-session';
                return { config: { appearance: DEFAULT_APPEARANCE } };
            },
        }));
        vi.stubGlobal('fetch', fetch);
        expect(await fetchAppearance()).toBeNull();
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('sends the manual quality/motion values only through the existing appearance section', async () => {
        const appearance = { ...DEFAULT_APPEARANCE, disableMotion: true, performanceMode: 'low' as const };
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => key === 'nowluma_token' ? 'fixture-session' : null,
        });
        const fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({ success: true, config: { appearance } }),
        }));
        vi.stubGlobal('fetch', fetch);
        await persistAppearance(appearance);
        const [, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(JSON.parse(options.body as string)).toEqual({ appearance });
        expect(new Headers(options.headers).get('X-Nowluma-Token')).toBe('fixture-session');
        expect(fetch).toHaveBeenCalledOnce();
    });

    it.each([
        { success: false, message: '磁盘写入失败' },
        { success: true },
        null,
    ])('rejects an unconfirmed successful-HTTP save response %j', async (payload) => {
        vi.stubGlobal('localStorage', { getItem: () => 'fixture-session' });
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })));
        await expect(persistAppearance(DEFAULT_APPEARANCE)).rejects.toThrow(
            payload?.success === false ? '磁盘写入失败' : '服务器未确认外观已保存',
        );
    });

    it('does not dispatch a delayed old-session save with the new session token', async () => {
        vi.stubGlobal('localStorage', { getItem: () => 'fixture-new-session' });
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(persistAppearance(DEFAULT_APPEARANCE, 'fixture-old-session')).rejects.toThrow(
            '登录状态已变化',
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not release onboarding when the session changes during the confirmed save', async () => {
        let token = 'fixture-old-session';
        vi.stubGlobal('localStorage', { getItem: () => token });
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => {
                token = 'fixture-new-session';
                return { success: true, config: { appearance: DEFAULT_APPEARANCE } };
            },
        })));
        await expect(persistAppearance(DEFAULT_APPEARANCE)).rejects.toThrow('登录状态已变化');
    });
});
