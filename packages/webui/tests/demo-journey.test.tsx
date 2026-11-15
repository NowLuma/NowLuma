import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../src/demo/api';
import { DemoApp } from '../src/demo/DemoApp';
import { DEMO_JOURNEY } from '../src/demo/journey';
import { demoLinkTarget, installDemoIsolation, memoryStorage } from '../src/demo/isolation';

// The real App is client-only (ThemeProvider has no SSR snapshot); render the guide,
// then check its source seam separately rather than duplicate console components.
vi.mock('@/App', () => ({ default: () => <div data-demo-console-seam="true" /> }));

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe('DEMO journey and real-console seams', () => {
    it('renders the bilingual guide and wires the actual client-only App seam', () => {
        const html = renderToStaticMarkup(<DemoApp api={new DemoApi()} />);

        for (const label of [
            'DEMO · 安全练习',
            'Real console',
            'DemoOnly!2026',
            'DemoChanged!2026',
            '123456',
            'Reset / 重置',
            'Fail next write',
            'Scenario / 情景',
            'No real login',
        ]) {
            expect(html).toContain(label);
        }

        expect(html).toContain('aria-controls="demo-guide"');
        expect(html).toContain('aria-current="step"');
        const app = source('../src/demo/DemoApp.tsx');
        expect(app).toContain('<App key={epoch} client={client} />');
        expect(app).toContain('@/components/interior/modal');
        expect(app).not.toContain('<iframe');
    });

    it('maps every practice step to a real route and named console control', () => {
        expect(DEMO_JOURNEY.map((step) => step.id)).toEqual([
            'setup',
            'desktop',
            'connection',
            'action',
            'logs',
            'storage',
            'settings',
        ]);

        for (const step of DEMO_JOURNEY) {
            expect(demoLinkTarget(step.route, 'https://example.invalid/Nowluma/demo/')).toBe(
                step.route,
            );
        }

        expect(source('../src/components/pages/processes-page.tsx')).toContain("'加载'");
        const tester = source('../src/components/debug/action-tester.tsx');

        for (const label of ['运行调用', '运行流式调用']) {
            expect(tester).toContain(`'${label}'`);
            expect(DEMO_JOURNEY.find((step) => step.id === 'action')?.description).toContain(label);
        }

        expect(DEMO_JOURNEY.find((step) => step.id === 'action')?.control).toBe(
            '接口调用 → send_private_msg → 运行调用',
        );
        expect(source('../src/components/pages/logs-page.tsx')).toContain('导出完整 TRACE');
        expect(source('../src/components/pages/settings-page.tsx')).toContain("label: '存储管理'");
        expect(source('../src/router/index.tsx')).toContain("import.meta.env.MODE === 'demo'");
        expect(source('../src/router/index.tsx')).toContain('createHashHistory()');
    });

    it('isolates bootstrap before all App/default-context imports and emits only the demo output', () => {
        const entry = source('../src/demo/main.tsx');
        expect(entry.indexOf('installDemoIsolation()')).toBeLessThan(
            entry.indexOf("await import('./api')"),
        );
        expect(entry).not.toContain('import App');
        expect(source('../src/demo/isolation.ts')).toContain("from './constants'");
        expect(source('../src/demo/constants.ts')).not.toContain('import ');
        const config = source('../vite.demo.config.ts');
        expect(config).toContain("base: './'");
        expect(config).toContain("'../../_site/demo'");
        expect(config).not.toContain('dist/client');
        expect(config).not.toContain('proxy:');
        const html = source('../demo.html');

        for (const policy of [
            "connect-src 'none'",
            "frame-src 'none'",
            "form-action 'none'",
            'img-src data: blob:',
            'name="referrer" content="no-referrer"',
        ]) {
            expect(html).toContain(policy);
        }
    });
});

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

    it('never reads existing site credentials and blocks real browser transports before API attach', async () => {
        const originalFetch = vi.fn();
        const readExisting = vi.fn(() => {
            throw new Error('must never read real storage');
        });
        const host = Object.assign(new EventTarget(), {
            fetch: originalFetch,
            location: { href: 'https://example.invalid/Nowluma/demo/?token=do-not-forward' },
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
        expect(host.history.replaceState).toHaveBeenCalledWith({}, '', '/Nowluma/demo/');
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
