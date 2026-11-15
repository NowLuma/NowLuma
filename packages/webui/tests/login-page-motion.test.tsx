import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/components/pages/login-page';

const state = vi.hoisted(() => ({
    fx: null as string | null,
    systemReduce: false,
    reduceMotion: false,
    disableMotion: false,
    low: false,
    palette: 'default',
    managedBy: null as string | null,
}));

vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            background: { type: 'none' },
            reduceMotion: state.reduceMotion,
            disableMotion: state.disableMotion,
            palette: state.palette,
        },
        performance: { low: state.low, mode: 'auto', fps: 30 },
        managedBy: state.managedBy,
        mode: 'light',
        setMode: vi.fn(),
    }),
    paletteResolved: (palette: string) => (palette === 'default' ? null : 'dark'),
}));

beforeEach(() => {
    Object.assign(state, {
        fx: null,
        systemReduce: false,
        reduceMotion: false,
        disableMotion: false,
        low: false,
        palette: 'default',
        managedBy: null,
    });
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => (key === 'nowluma_login_fx' ? state.fx : null),
    });
    vi.stubGlobal(
        'window',
        Object.assign(new EventTarget(), {
            matchMedia: () => ({ matches: state.systemReduce }),
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

function render() {
    return renderToStaticMarkup(<LoginPage onLogin={async () => ({ success: false })} />);
}

describe('LoginPage display effects and motion', () => {
    it('maps compatible saved 0/1 preferences to real rendering differences', () => {
        state.fx = '1';
        const full = render();
        expect(full).toContain('data-login-effects="full"');
        expect(full).toContain('data-line-motion="true"');
        expect(full).toContain('workspace-auth-lens');
        expect(full).toContain('aria-label="显示效果"');
        state.fx = '0';
        const simple = render();
        expect(simple).toContain('data-login-effects="simple"');
        expect(simple).toContain('ui-line-field');
        expect(simple).not.toContain('data-line-motion="true"');
        expect(simple).not.toContain('workspace-auth-lens');
        expect(simple).toContain('role="status" aria-live="polite"');
        expect(simple).toContain('简洁');
    });

    it.each(['reduceMotion', 'disableMotion'] as const)(
        'keeps static optics, but no drift, when %s overrides the device choice',
        (setting) => {
            state.fx = '1';
            state[setting] = true;
            const html = render();
            expect(html).not.toContain('data-line-motion="true"');
            expect(html).toContain('workspace-auth-lens');
            expect(html).toContain('细腻 · 静态');
        },
    );

    it('starts quietly for an OS reduced-motion default and obeys MotionConfig', () => {
        state.systemReduce = true;
        expect(render()).not.toContain('data-line-motion="true"');
        state.fx = '1';
        const html = renderToStaticMarkup(
            <MotionConfig reducedMotion="always">
                <LoginPage onLogin={async () => ({ success: false })} />
            </MotionConfig>,
        );
        expect(html).not.toContain('data-line-motion="true"');
    });

    it('uses a real frosted lens and short-motion budget in automatic low mode, without changing the saved choice', () => {
        state.fx = '1';
        state.low = true;
        const html = render();
        expect(html).toContain('data-login-effects="full"');
        expect(html).toContain('workspace-auth-lens');
        expect(html).toContain('data-glass-renderer="frosted"');
        expect(html).not.toContain('data-line-motion="true"');
        expect(html).toContain('细腻 · 磨砂');
        expect(state.fx).toBe('1');
    });

    it('keeps the canonical sized identity under named palettes, while respecting host-owned presentation', () => {
        state.palette = 'catppuccin-mocha';
        state.fx = '1';
        const html = render();
        expect(html).toContain('width="192" height="192" viewBox="0 0 192 192"');
        expect(html).toContain('data-line-motion="true"');
        expect(html).not.toContain('workspace-theme-trigger');
        state.managedBy = 'maibot';
        const hosted = render();
        expect(hosted).not.toContain('aria-label="显示效果"');
        expect(hosted).not.toContain('workspace-auth-lens');
        expect(hosted).not.toContain('data-line-motion="true"');
    });

    it('uses a composed session-to-results line study, with only a small canonical signature', () => {
        const html = render();
        expect(html).toContain('workspace-auth-diagram');
        expect(html).toContain('viewBox="0 0 352 240"');
        expect(html).toContain('workspace-auth-stream');
        expect(html).not.toContain('workspace-auth-field');
        const css = readFileSync(new URL('../src/styles/workspace.css', import.meta.url), 'utf8');
        expect(css).toMatch(/\.workspace-auth-signature\s*\{[^}]*width: 28px;[^}]*height: 28px;/);
        expect(css).toContain('vector-effect: non-scaling-stroke;');
        const diagram = html.match(/<svg class="workspace-auth-diagram"[\s\S]*?<\/svg>/)?.[0] ?? '';
        expect(
            [
                ...new Set(
                    [...diagram.matchAll(/stroke-width="(\d+)"/g)].map((match) => Number(match[1])),
                ),
            ].sort(),
        ).toEqual([1, 2, 3, 4]);
    });

    it('retains password/reveal controls and the brand without legacy performance-help copy or a modal', () => {
        const html = render();
        expect(html).toMatch(
            /<img src="(?:data:image\/svg\+xml,[^"]*|[^"]*nowluma-mark\.svg[^"]*)" alt=""/,
        );
        expect(html).not.toContain('alt="Nowluma"');
        expect(html).toContain('aria-label="访问密码"');
        expect(html).toContain('autoComplete="current-password"');
        expect(html).toContain('aria-label="显示密码"');
        expect(html).toContain('打开工作台');
        expect(html).not.toContain('我觉得这个界面很卡怎么办');
        expect(html).not.toContain('界面有点卡顿');
        expect(html).not.toContain('性能与流畅度');
        expect(html).not.toContain('role="dialog"');
    });
});
