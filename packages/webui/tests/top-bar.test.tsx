import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiLayoutItem } from '../src/types';
import { Sidebar, NAV_ITEMS, NavigationDock } from '../src/components/layout/sidebar';
import { TopBar } from '../src/components/layout/top-bar';

const state = vi.hoisted(() => ({
    pathname: '/',
    navItems: [] as UiLayoutItem[],
    topbarItems: [] as UiLayoutItem[],
    editing: false,
    palette: 'default',
    pinned: false,
    mode: 'light',
    managedBy: null as string | null,
    menuOpen: false,
    setMode: vi.fn(),
    setAppearance: vi.fn(),
    setNavItems: vi.fn(),
    reorderRows: [] as { props: { item: UiLayoutItem; onMove: (direction: -1 | 1) => void } }[],
}));

vi.mock('motion/react', async (original) => {
    const actual = await original<typeof import('motion/react')>();
    const { Children } = await import('react');
    return {
        ...actual,
        Reorder: {
            Group: ({ children }: { children: ReactNode }) => {
                state.reorderRows = Children.toArray(children) as typeof state.reorderRows;
                return <div>{children}</div>;
            },
            Item: ({ children }: { children: ReactNode }) => <div>{children}</div>,
        },
    };
});
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
        setNavItems: state.setNavItems,
        setEditing: vi.fn(),
    }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            palette: state.palette,
            reduceMotion: true,
            disableMotion: true,
            sidebarPinned: state.pinned,
        },
        mode: state.mode,
        managedBy: state.managedBy,
        setMode: state.setMode,
        setAppearance: state.setAppearance,
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
        pinned: false,
        mode: 'light',
        managedBy: null,
        menuOpen: false,
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
            />
        </MotionConfig>,
    );
}

describe('workspace navigation and masthead', () => {
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

    it('preserves controlled menu semantics, a compact theme trigger, kiosk and logout', () => {
        const opened = topbar(true);
        expect(opened).toContain('aria-label="关闭菜单"');
        expect(opened).toContain('aria-expanded="true"');
        expect(topbar()).toContain('aria-expanded="false"');

        for (const label of ['已连接', '切换主题：浅色', '展示模式', '登出']) {
            expect(opened).toContain(label);
        }

        expect(opened).toContain('aria-haspopup="listbox"');
        expect(opened.match(/workspace-theme-trigger/g)).toHaveLength(1);
        expect(opened).not.toContain('theme-toggle-pill');
        expect(opened).not.toContain('ui-line-field');
        expect(opened).not.toContain('max-[379px]:hidden');
    });

    it('keeps visible route labels and a single active destination in the persistent dock', () => {
        state.pathname = '/config';
        const markup = renderToStaticMarkup(<NavigationDock />);
        expect(markup).toContain('aria-label="主导航"');
        expect(markup).toContain('data-glass-renderer="frosted"');
        expect(markup).not.toContain('data-collapsed');
        expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
        expect(markup).toMatch(/href="\/config"[^>]*aria-current="page"/);

        for (const item of NAV_ITEMS) {
            expect(markup).toContain(`href="${item.to}"`);
            expect(markup).toContain(`workspace-dock-label">${item.label}`);
        }

        state.pinned = true;
        expect(renderToStaticMarkup(<NavigationDock />)).toContain('data-labels-pinned="true"');
    });

    it('reconciles the same saved order and visibility in the dock and navigation menu', () => {
        state.navItems = [
            { id: '/logs', visible: false },
            { id: '/debug', visible: true },
            { id: '/', visible: false },
            { id: '/settings', visible: false },
        ];

        for (const component of [<Sidebar key="menu" />, <NavigationDock key="dock" />]) {
            const markup = renderToStaticMarkup(component);
            expect(markup.indexOf('href="/debug"')).toBeLessThan(markup.indexOf('href="/"'));
            expect(markup).toContain('href="/"');
            expect(markup).toContain('href="/settings"');
            expect(markup).not.toContain('href="/logs"');
        }

        state.editing = true;
        const editor = renderToStaticMarkup(<Sidebar />);
        expect(editor).toContain('aria-label="上移总览"');
        expect(editor).toContain('aria-label="下移总览"');
        expect(editor).toContain('aria-label="显示日志"');
        expect(editor).not.toContain('aria-label="隐藏总览"');
        expect(editor).toContain('必选项，不可隐藏');
    });

    it('moves navigation with the keyboard buttons without losing hidden preferences', () => {
        state.editing = true;
        state.navItems = [
            { id: '/', visible: true },
            { id: '/logs', visible: false },
            { id: '/settings', visible: true },
        ];
        state.setNavItems.mockClear();
        renderToStaticMarkup(<Sidebar />);
        const logs = state.reorderRows.find((row) => row.props.item.id === '/logs');
        expect(logs).toBeDefined();
        logs!.props.onMove(-1);
        expect(state.setNavItems).toHaveBeenLastCalledWith([
            { id: '/logs', visible: false },
            { id: '/', visible: true },
            { id: '/settings', visible: true },
            { id: '/processes', visible: true },
            { id: '/config', visible: true },
            { id: '/debug', visible: true },
        ]);
        state.setNavItems.mockClear();
        state.reorderRows[0].props.onMove(-1);
        state.reorderRows[state.reorderRows.length - 1].props.onMove(1);
        expect(state.setNavItems).not.toHaveBeenCalled();
    });

    it('honours hidden chrome controls while keeping logout and the navigation menu', () => {
        state.topbarItems = ['status', 'theme', 'kiosk'].map((id) => ({ id, visible: false }));
        const hidden = topbar();
        expect(hidden).toContain('aria-label="登出"');
        expect(hidden).not.toContain('已连接');
        expect(hidden).not.toContain('aria-label="展示模式"');
        expect(hidden).not.toContain('workspace-theme-trigger');
        expect(hidden).toContain('aria-label="打开菜单"');
        expect(hidden).not.toContain('ui-line-field');
        state.topbarItems = [];
        state.palette = 'catppuccin-mocha';
        expect(topbar()).not.toContain('workspace-theme-trigger');
        state.palette = 'default';
        state.managedBy = 'maibot';
        expect(topbar()).not.toContain('workspace-theme-trigger');
    });
});
