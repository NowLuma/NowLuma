import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MainLayout } from '../src/components/layout/main-layout';

const state = vi.hoisted(() => ({ kiosk: false, wallpaper: false }));
vi.mock('@tanstack/react-router', async (original) => ({
    ...(await original<typeof import('@tanstack/react-router')>()),
    useRouterState: ({
        select,
    }: {
        select: (value: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: '/' } }),
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
        <a href={to} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            background: { type: state.wallpaper ? 'image' : 'none' },
            palette: 'default',
            reduceMotion: true,
            disableMotion: true,
            sidebarPinned: false,
        },
        mode: 'system',
        setMode: vi.fn(),
    }),
    paletteResolved: () => false,
}));
vi.mock('@/contexts/LayoutContext', async (original) => ({
    ...(await original<typeof import('../src/contexts/LayoutContext')>()),
    useLayout: () => ({
        navItems: [],
        topbarItems: [],
        editing: false,
        setNavItems: vi.fn(),
        setEditing: vi.fn(),
    }),
}));
vi.mock('@/contexts/KioskContext', () => ({
    useKiosk: () => ({ kiosk: state.kiosk, enter: vi.fn(), exit: vi.fn() }),
}));
vi.mock('@/contexts/AppStateContext', () => ({ useAppState: () => ({ updateInfo: null }) }));
vi.mock('@/components/confirm-dialog', () => ({ ConfirmDialog: () => null }));

beforeEach(() => Object.assign(state, { kiosk: false, wallpaper: false }));

function shell() {
    return renderToStaticMarkup(
        <MotionConfig reducedMotion="always">
            <MainLayout status="已连接" onLogout={vi.fn()} notice={<p>账号数据库状态提示</p>}>
                <article>当前页面内容</article>
            </MainLayout>
        </MotionConfig>,
    );
}

describe('MainLayout workspace', () => {
    it('keeps one workspace, a persistent labelled dock, and an accessible content target', () => {
        const html = shell();
        expect(html).toContain('id="workspace-content" tabindex="-1"');
        expect(html).toContain('workspace-skip-link');
        expect(html).toContain('跳到页面内容');
        expect(html).not.toContain('href="#workspace-content"');
        expect(html).toContain('aria-label="主导航"');
        expect(html).toContain('workspace-dock-anchor');
        expect(html).toContain('当前页面内容');
        expect(html).toContain('账号数据库状态提示');
        expect(html).not.toContain('<aside');
        expect(html).not.toContain('width:64px');
        expect(html).not.toContain('opacity:0.45');
    });

    it('keeps the document and the exit control in kiosk mode', () => {
        state.kiosk = true;
        const html = shell();
        expect(html).toContain('data-workspace-kiosk="true"');
        expect(html).toContain('当前页面内容');
        expect(html).toContain('aria-label="退出展示模式"');
        expect(html).toContain('退出展示模式 (Esc)');
        expect(html).not.toContain('workspace-masthead');
        expect(html).not.toContain('workspace-dock-anchor');
        expect(html).not.toContain('账号数据库状态提示');
        expect(html).not.toContain('aria-label="登出"');
    });

    it('retains custom wallpaper between the stable content surfaces', () => {
        state.wallpaper = true;
        const html = shell();
        expect(html).toContain('class="workspace-shell text-foreground"');
        expect(html).toContain('当前页面内容');
        expect(html).toContain('workspace-dock');
    });
});
