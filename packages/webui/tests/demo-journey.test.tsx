import { DemoApi } from '../src/demo/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoLinkTarget, installDemoIsolation, memoryStorage } from '../src/demo/isolation';

afterEach(() => vi.unstubAllGlobals());

describe('DEMO browser isolation boundary', () => {
    it('keeps all storage memory-only with normal Storage semantics', () => {
        const first = memoryStorage();
        const second = memoryStorage();
        first.setItem('nowluma_token', 'demo-session');
        expect(first.length).toBe(1);
        expect(first.key(0)).toBe('nowluma_token');
        expect(second.getItem('nowluma_token')).toBeNull();
        first.removeItem('nowluma_token');
        expect(first.length).toBe(0);
        first.setItem('theme', 'dark');
        first.clear();
        expect(first.key(0)).toBeNull();
    });

    it('blocks external, unknown, javascript and physical desktop links', () => {
        const current = 'https://example.invalid/Nowluma/demo/';

        for (const href of [
            'https://external.invalid/',
            '//external.invalid/api',
            'javascript:alert(1)',
            '/unknown',
            '/api/system',
            'https://external.invalid/desktop/',
            'http://[invalid',
        ]) {
            expect(demoLinkTarget(href, current)).toBeNull();
        }

        expect(demoLinkTarget('/desktop/vnc.html', current)).toBe('desktop');
        expect(demoLinkTarget('#desktop', current)).toBe('desktop');
        expect(demoLinkTarget('/Nowluma/demo/#/settings?tab=storage', current)).toBe(
            '/settings?tab=storage',
        );
    });

    it.each([
        ['?token=do-not-forward', '/Nowluma/demo/'],
        [
            '?tutorial=debug&lang=en&embed=1&token=secret&selector=body&url=https://evil.invalid#/settings?tab=storage&token=secret',
            '/Nowluma/demo/?tutorial=debug&lang=en&embed=1#/settings?tab=storage',
        ],
        ['?tutorial=__proto__&password=secret#/https://evil.invalid', '/Nowluma/demo/'],
    ])('isolates storage and transports while sanitizing %s', async (query, canonical) => {
        const originalFetch = vi.fn();
        const readExisting = vi.fn(() => {
            throw new Error('must never read real storage');
        });
        const host = Object.assign(new EventTarget(), {
            fetch: originalFetch,
            location: { href: `https://example.invalid/Nowluma/demo/${query}` },
            history: { replaceState: vi.fn() },
        });
        Object.defineProperty(host, 'localStorage', { configurable: true, get: readExisting });
        Object.defineProperty(host, 'sessionStorage', { configurable: true, get: readExisting });
        class FakeElement {
            setAttribute() {}
        }
        vi.stubGlobal('window', host);
        vi.stubGlobal('navigator', {});
        vi.stubGlobal('Element', FakeElement);
        vi.stubGlobal('HTMLImageElement', class extends FakeElement {});
        vi.stubGlobal('document', { documentElement: {}, addEventListener: vi.fn() });
        vi.stubGlobal(
            'MutationObserver',
            class {
                observe() {}
            },
        );
        const isolation = installDemoIsolation();
        expect(readExisting).not.toHaveBeenCalled();
        expect(isolation.local.getItem('nowluma_token')).toBeNull();
        expect(isolation.session.getItem('nowluma_safe_mode')).toBe('1');
        expect(host.history.replaceState).toHaveBeenCalledWith({}, '', canonical);
        const blocked = await host.fetch('/api/system');
        expect(blocked.status).toBe(503);
        expect(originalFetch).not.toHaveBeenCalled();

        for (const transport of ['WebSocket', 'XMLHttpRequest', 'EventSource'] as const) {
            const constructor = (host as unknown as Record<string, new () => object>)[transport];
            expect(() => new constructor()).toThrow('Real network transport is disabled');
        }

        const api = new DemoApi();
        isolation.attach(api);
        expect((await host.fetch('https://external.invalid/api/system')).status).toBe(403);
        expect(originalFetch).not.toHaveBeenCalled();
        api.reset();
    });
});
