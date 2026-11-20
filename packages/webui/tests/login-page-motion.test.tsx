import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/components/pages/login-page';

const state = vi.hoisted(() => ({
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
        performance: { low: state.low, mode: 'high' },
        managedBy: state.managedBy,
        mode: 'light',
        setMode: vi.fn(),
    }),
    paletteResolved: (palette: string) => (palette === 'default' ? null : 'dark'),
}));

beforeEach(() => {
    Object.assign(state, {
        systemReduce: false,
        reduceMotion: false,
        disableMotion: false,
        low: false,
        palette: 'default',
        managedBy: null,
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
    it.each(['reduceMotion', 'disableMotion'] as const)(
        'keeps static optics, but no drift, when %s disables movement',
        (setting) => {
            state[setting] = true;
            const html = render();
            expect(html).not.toContain('data-line-motion="true"');
        },
    );

    it('starts quietly for an OS reduced-motion default and obeys MotionConfig', () => {
        state.systemReduce = true;
        const html = renderToStaticMarkup(
            <MotionConfig reducedMotion="always">
                <LoginPage onLogin={async () => ({ success: false })} />
            </MotionConfig>,
        );
        expect(html).not.toContain('data-line-motion="true"');
    });

    it('uses frosted glass under an explicit low-quality preference without enabling motion', () => {
        state.low = true;
        const html = render();
        expect(html).toContain('data-glass-renderer="frosted"');
        expect(html).not.toContain('data-line-motion="true"');
    });

    it('respects host-owned login presentation under a named palette', () => {
        state.palette = 'catppuccin-mocha';
        const html = render();
        expect(html).toContain('data-line-motion="true"');
        expect(html).not.toContain('workspace-theme-trigger');
        state.managedBy = 'maibot';
        const hosted = render();
        expect(hosted).not.toContain('data-line-motion="true"');
    });
});
