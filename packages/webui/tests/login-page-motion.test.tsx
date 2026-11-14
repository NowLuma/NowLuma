import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/components/pages/login-page';

const state = vi.hoisted(() => ({
    fx: null as string | null,
    systemReduce: false,
    reduceMotion: false,
    disableMotion: false,
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
        managedBy: state.managedBy,
        mode: 'light',
        setMode: vi.fn(),
    }),
    paletteResolved: (palette: string) => (palette === 'default' ? null : 'dark'),
}));
vi.mock('@/components/interior/modal', () => ({
    Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
    Object.assign(state, {
        fx: null,
        systemReduce: false,
        reduceMotion: false,
        disableMotion: false,
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

describe('LoginPage line-field preference', () => {
    it('uses the existing device-local animated-background choice for the replacement', () => {
        state.fx = '1';
        const animated = render();
        expect(animated).toContain('data-line-motion="true"');
        expect(animated).toContain('aria-label="登录页动态背景"');
        expect(animated).toContain('aria-checked="true"');
        state.fx = '0';
        const paused = render();
        expect(paused).toContain('ui-line-field');
        expect(paused).not.toContain('data-line-motion="true"');
        expect(paused).toContain('aria-checked="false"');
    });

    it.each(['reduceMotion', 'disableMotion'] as const)(
        'does not drift when %s overrides the local choice',
        (setting) => {
            state.fx = '1';
            state[setting] = true;
            expect(render()).not.toContain('data-line-motion="true"');
        },
    );

    it('starts without drift for an OS reduced-motion default and follows MotionConfig', () => {
        state.systemReduce = true;
        expect(render()).not.toContain('data-line-motion="true"');
        state.fx = '1';
        const markup = renderToStaticMarkup(
            <MotionConfig reducedMotion="always">
                <LoginPage onLogin={async () => ({ success: false })} />
            </MotionConfig>,
        );
        expect(markup).not.toContain('data-line-motion="true"');
    });

    it('keeps a real sized line-field when a named palette hides the theme toggle', () => {
        state.palette = 'catppuccin-mocha';
        state.fx = '1';
        const markup = render();
        expect(markup).toContain('min-h-12 min-w-36');
        expect(markup).toContain('data-line-motion="true"');
        expect(markup).not.toContain('theme-toggle-pill');
    });

    it('retains the password form, keyboard reveal control, brand and performance helper', () => {
        const markup = render();
        expect(markup).toContain('src="/logo.png"');
        expect(markup).toContain('aria-label="访问密码"');
        expect(markup).toContain('autoComplete="current-password"');
        expect(markup).toContain('aria-label="显示密码"');
        expect(markup).toContain('进入控制台');
        expect(markup).toContain('我觉得这个界面很卡怎么办');
        expect(markup).not.toContain('login-waves');
        expect(markup).not.toContain('backdrop-blur-2xl');
    });
});
