import { useState } from 'react';
import { LogOut, Monitor } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';
import { IconMorph } from '@/components/interior/icon-morph';
import { ThemeToggle } from '@/components/theme-toggle';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { NAV_ITEMS } from '@/components/layout/sidebar';
import { reconcileLayoutItems, useLayout } from '@/contexts/LayoutContext';
import { useKiosk } from '@/contexts/KioskContext';
import { BRAND_LOGO_URL } from '@/brand';
import { APP_NAME } from '@/types';

export const TOPBAR_CATALOGUE: { id: string; label: string }[] = [
    { id: 'status', label: '连接状态徽章' },
    { id: 'theme', label: '主题切换按钮' },
    { id: 'kiosk', label: '展示模式按钮' },
];

interface TopBarProps {
    status: string;
    mobileOpen: boolean;
    onMobileOpenChange: (open: boolean) => void;
    onLogout: () => void;
}

export function TopBar({ status, mobileOpen, onMobileOpenChange, onLogout }: TopBarProps) {
    const [confirmLogout, setConfirmLogout] = useState(false);
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const meta = NAV_ITEMS.find((item) => item.to === pathname);
    const online = status === '已连接';
    const { topbarItems } = useLayout();
    const { enter: enterKiosk } = useKiosk();
    const shown = new Set(
        reconcileLayoutItems(
            topbarItems,
            TOPBAR_CATALOGUE.map((item) => item.id),
        )
            .filter((item) => item.visible)
            .map((item) => item.id),
    );

    return (
        <header data-ui-surface="chrome" className="workspace-masthead">
            <div className="workspace-masthead-inner">
                <button
                    type="button"
                    onClick={() => document.getElementById('workspace-content')?.focus()}
                    className="workspace-skip-link"
                >
                    跳到页面内容
                </button>
                <div className="workspace-masthead-brand" aria-label={APP_NAME}>
                    <img src={BRAND_LOGO_URL} alt="" className="size-7 rounded-md" />
                    <span>{APP_NAME}</span>
                </div>
                <div className="workspace-page-context">
                    <h1 title={meta?.label}>{meta?.label ?? '控制台'}</h1>
                    <span className="workspace-page-description">{meta?.description}</span>
                </div>
                <div className="workspace-session-actions">
                    {shown.has('status') && (
                        <span
                            className="workspace-connection-state"
                            data-online={online}
                            title={status}
                            role="status"
                        >
                            <span aria-hidden="true" className="workspace-status-dot" />
                            <span className="workspace-status-label">{status}</span>
                        </span>
                    )}
                    {shown.has('theme') && <ThemeToggle />}
                    {shown.has('kiosk') && (
                        <button
                            type="button"
                            onClick={enterKiosk}
                            aria-label="展示模式"
                            title="展示模式（Esc 退出）"
                            className="workspace-icon-button"
                        >
                            <Monitor className="size-4" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setConfirmLogout(true)}
                        aria-label="登出"
                        title="登出"
                        className="workspace-icon-button workspace-logout"
                    >
                        <LogOut className="size-4" />
                    </button>
                    <IconMorph
                        preset="menu-close"
                        labels={['打开菜单', '关闭菜单']}
                        semantics="expanded"
                        active={mobileOpen}
                        onActiveChange={(index) => onMobileOpenChange(index === 1)}
                        className="workspace-icon-button workspace-menu-trigger"
                    />
                </div>
            </div>
            <ConfirmDialog
                open={confirmLogout}
                onOpenChange={setConfirmLogout}
                title="确认登出？"
                description="登出后将清除当前会话令牌，您需要重新输入访问密码才能进入控制台。"
                confirmText="登出"
                destructive
                activity={{
                    title: '正在退出登录',
                    successTitle: '已退出登录',
                    errorTitle: '退出登录失败',
                }}
                onConfirm={onLogout}
            />
        </header>
    );
}
