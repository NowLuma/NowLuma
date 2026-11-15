import type { ComponentProps, ReactNode } from 'react';
import type { useDropdown } from '../src/components/interior/dropdown';
import type { ConfirmDialog } from '../src/components/confirm-dialog';
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
    sessionMenu: null as ReturnType<typeof useDropdown> | null,
    confirm: null as ComponentProps<typeof ConfirmDialog> | null,
    enterKiosk: vi.fn(),
    onLogout: vi.fn(),
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
vi.mock('@/components/interior/dropdown', async (original) => {
    const actual = await original<typeof import('../src/components/interior/dropdown')>();
    return {
        ...actual,
        useDropdown: (options: Parameters<typeof useDropdown>[0]) => {
            const dropdown = actual.useDropdown(options);

            if (options.items.some((item) => item.value === 'logout')) {
                state.sessionMenu = dropdown;
                return { ...dropdown, open: state.menuOpen };
            }

            return dropdown;
        },
    };
});
vi.mock('@/contexts/AppStateContext', () => ({ useAppState: () => ({ updateInfo: null }) }));
vi.mock('@/contexts/KioskContext', () => ({ useKiosk: () => ({ enter: state.enterKiosk }) }));
vi.mock('@/hooks/use-media-query', () => ({
    useDesktopSidebar: () => true,
    useMediaQuery: () => true,
}));
vi.mock('@/components/confirm-dialog', () => ({
    ConfirmDialog: (props: ComponentProps<typeof ConfirmDialog>) => {
        state.confirm = props;
        return null;
    },
}));

beforeEach(() => {
    vi.clearAllMocks();
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
        sessionMenu: null,
        confirm: null,
    });
});

function topbar(mobileOpen = false) {
    return renderToStaticMarkup(
        <MotionConfig reducedMotion="always">
            <TopBar
                status="已连接"
                mobileOpen={mobileOpen}
                onMobileOpenChange={vi.fn()}
                onLogout={state.onLogout}
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

        expect(NAV_ITEMS.map((item) => item.label)).toEqual([
            '工作台',
            'QQ 会话',
            '机器人连接',
            '运行记录',
            '调试工具',
            '偏好设置',
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

    it('separates page navigation, theme choices and session actions with distinct icons', () => {
        const opened = topbar(true);
        expect(opened).toContain('aria-label="收起导航"');
        expect(opened).toContain('aria-expanded="true"');
        expect(topbar()).toContain('aria-label="页面导航"');
        expect(topbar()).toContain('aria-expanded="false"');
        expect(opened).toContain('已连接');
        expect(opened).toContain('切换主题：浅色');
        expect(opened).toContain('aria-label="会话操作"');
        expect(opened).toContain('aria-haspopup="menu"');
        expect(opened).toContain('aria-haspopup="listbox"');
        expect(opened).toContain('lucide-palette');
        expect(opened).toContain('lucide-ellipsis');
        expect(opened).not.toContain('lucide-monitor');
        expect(opened.match(/workspace-theme-trigger/g)).toHaveLength(1);
        expect(opened).not.toContain('theme-toggle-pill');
        expect(opened).not.toContain('ui-line-field');
        state.menuOpen = true;
        const actions = topbar();
        expect(actions).toContain('role="menu"');
        expect(actions.match(/role="menuitem"/g)).toHaveLength(2);
        expect(actions).toContain('展示模式');
        expect(actions).toContain('退出登录');
        expect(actions).toContain('lucide-expand');
    });

    it('keeps kiosk immediate and logout behind the existing destructive confirmation', async () => {
        topbar();
        const menu = state.sessionMenu;

        if (!menu || !state.confirm) {
            throw new Error('Session controls were not rendered');
        }

        const focus = vi.fn();
        menu.triggerProps.ref.current = { focus } as unknown as HTMLButtonElement;
        menu.getItemProps(0).onClick();
        expect(state.enterKiosk).toHaveBeenCalledOnce();
        menu.getItemProps(1).onClick();
        expect(state.onLogout).not.toHaveBeenCalled();
        expect(focus).toHaveBeenCalledTimes(2);
        expect(state.confirm.title).toBe('退出登录？');
        expect(state.confirm.destructive).toBe(true);
        await state.confirm.onConfirm();
        expect(state.onLogout).toHaveBeenCalledOnce();
    });

    it('keeps visible route labels and a single active destination in the persistent dock', () => {
        state.pathname = '/config';
        const markup = renderToStaticMarkup(<NavigationDock />);
        expect(markup).toContain('aria-label="主导航"');
        expect(markup).toContain('data-glass-renderer="frosted"');
        expect(markup.match(/workspace-dock-marker/g)).toHaveLength(1);
        expect(markup).toContain('workspace-dock-track');
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
        expect(editor).toContain('aria-label="上移工作台"');
        expect(editor).toContain('aria-label="下移工作台"');
        expect(editor).toContain('aria-label="显示运行记录"');
        expect(editor).not.toContain('aria-label="隐藏工作台"');
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
        state.menuOpen = true;
        const hidden = topbar();
        expect(hidden).toContain('退出登录');
        expect(hidden).toContain('aria-label="会话操作"');
        expect(hidden).not.toContain('已连接');
        expect(hidden).not.toContain('展示模式');
        expect(hidden).not.toContain('workspace-theme-trigger');
        expect(hidden).toContain('aria-label="页面导航"');
        expect(hidden).not.toContain('ui-line-field');
        state.topbarItems = [];
        state.palette = 'catppuccin-mocha';
        expect(topbar()).not.toContain('workspace-theme-trigger');
        state.palette = 'default';
        state.managedBy = 'maibot';
        expect(topbar()).not.toContain('workspace-theme-trigger');
    });
});
