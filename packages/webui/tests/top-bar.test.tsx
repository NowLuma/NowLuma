import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiLayoutItem } from '../src/types';
import { Sidebar, NAV_ITEMS } from '../src/components/layout/sidebar';
import { TopBar } from '../src/components/layout/top-bar';

const state = vi.hoisted(() => ({
    pathname: '/',
    navItems: [] as UiLayoutItem[],
    topbarItems: [] as UiLayoutItem[],
    editing: false,
    palette: 'default',
}));

vi.mock('@tanstack/react-router', async (original) => ({
    ...(await original<typeof import('@tanstack/react-router')>()),
    useRouterState: ({
        select,
    }: {
        select: (value: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: state.pathname } }),
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
        <a href={to} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('@/contexts/LayoutContext', async (original) => ({
    ...(await original<typeof import('../src/contexts/LayoutContext')>()),
    useLayout: () => ({
        navItems: state.navItems,
        topbarItems: state.topbarItems,
        editing: state.editing,
        setNavItems: vi.fn(),
        setEditing: vi.fn(),
    }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            palette: state.palette,
            reduceMotion: true,
            disableMotion: true,
            sidebarPinned: false,
        },
        mode: 'light',
        setMode: vi.fn(),
        setAppearance: vi.fn(),
    }),
    paletteResolved: (palette: string) => (palette === 'default' ? null : 'dark'),
}));
vi.mock('@/contexts/AppStateContext', () => ({ useAppState: () => ({ updateInfo: null }) }));
vi.mock('@/contexts/KioskContext', () => ({ useKiosk: () => ({ enter: vi.fn() }) }));
vi.mock('@/hooks/use-media-query', () => ({
    useDesktopSidebar: () => true,
    useMediaQuery: () => true,
}));
vi.mock('@/components/confirm-dialog', () => ({ ConfirmDialog: () => null }));

beforeEach(() =>
    Object.assign(state, {
        pathname: '/',
        navItems: [],
        topbarItems: [],
        editing: false,
        palette: 'default',
    }),
);

function topbar(mobileOpen = false) {
    return renderToStaticMarkup(
        <MotionConfig reducedMotion="always">
            <TopBar
                status="已连接"
                mobileOpen={mobileOpen}
                onMobileOpenChange={vi.fn()}
                onLogout={vi.fn()}
                isMobile
            />
        </MotionConfig>,
    );
}

describe('fused console shell', () => {
    it('retains all six real routes, brand avatar and pinned navigation', () => {
        const markup = renderToStaticMarkup(<Sidebar />);
        expect(NAV_ITEMS.map((item) => item.to)).toEqual([
            '/',
            '/processes',
            '/config',
            '/logs',
            '/debug',
            '/settings',
        ]);

        for (const item of NAV_ITEMS) {
            expect(markup).toContain(`href="${item.to}"`);
            expect(markup).toContain(item.label);
        }

        expect(markup).toMatch(
            /<img src="(?:data:image\/svg\+xml,[^"]*|[^"]*nowluma-mark\.svg[^"]*)" alt=""/,
        );
        expect(markup).not.toContain('alt="Nowluma"');
        state.navItems = NAV_ITEMS.map((item) => ({ id: item.to, visible: false }));
        const hidden = renderToStaticMarkup(<Sidebar />);
        expect(hidden).toContain('href="/"');
        expect(hidden).toContain('href="/settings"');
        expect(hidden).not.toContain('href="/logs"');
    });

    it('keeps saved navigation order and the editable navigation entry', () => {
        state.navItems = [
            { id: '/debug', visible: true },
            { id: '/', visible: true },
        ];
        const ordered = renderToStaticMarkup(<Sidebar />);
        expect(ordered.indexOf('href="/debug"')).toBeLessThan(ordered.indexOf('href="/"'));
        state.editing = true;
        const editing = renderToStaticMarkup(<Sidebar />);
        expect(editing).toContain('编辑导航');
        expect(editing).toContain('拖动排序');
        expect(editing).toContain('完成');
    });

    it('preserves controlled mobile-menu semantics, theme choices, kiosk and logout', () => {
        const opened = topbar(true);
        expect(opened).toContain('aria-label="关闭菜单"');
        expect(opened).toContain('aria-expanded="true"');
        expect(topbar()).toContain('aria-expanded="false"');

        for (const label of ['已连接', '跟随系统', '浅色', '深色', '展示模式', '登出']) {
            expect(opened).toContain(label);
        }

        expect(opened).toContain('data-glass-renderer="frosted"');
        expect(opened).not.toContain('max-[379px]:hidden');
    });

    it('honours hidden chrome controls without hiding logout or squeezing the line-field', () => {
        state.topbarItems = ['status', 'theme', 'kiosk'].map((id) => ({ id, visible: false }));
        const hidden = topbar();
        expect(hidden).toContain('aria-label="登出"');
        expect(hidden).not.toContain('已连接');
        expect(hidden).not.toContain('aria-label="展示模式"');
        expect(hidden).not.toContain('ui-line-field');
        state.topbarItems = [];
        state.palette = 'catppuccin-mocha';
        expect(topbar()).not.toContain('ui-line-field');
    });
});
