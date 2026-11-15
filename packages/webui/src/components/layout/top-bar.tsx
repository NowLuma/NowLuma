import { useState } from 'react';
import { Ellipsis, Expand, LogOut } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { useRouterState } from '@tanstack/react-router';
import { useDropdown } from '@/components/interior/dropdown';
import { IconMorph } from '@/components/interior/icon-morph';
import { GlassMaterial } from '@/components/ui/glass-material';
import { ThemeToggle } from '@/components/theme-toggle';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { NAV_ITEMS } from '@/components/layout/sidebar';
import { reconcileLayoutItems, useLayout } from '@/contexts/LayoutContext';
import { useKiosk } from '@/contexts/KioskContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BRAND_LOGO_URL } from '@/brand';
import { APP_NAME } from '@/types';

export const TOPBAR_CATALOGUE: { id: string; label: string }[] = [
    { id: 'status', label: '连接状态' },
    { id: 'theme', label: '主题菜单' },
    { id: 'kiosk', label: '展示模式' },
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
    const { topbarItems } = useLayout();
    const { enter: enterKiosk } = useKiosk();
    const { appearance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const shown = new Set(
        reconcileLayoutItems(
            topbarItems,
            TOPBAR_CATALOGUE.map((item) => item.id),
        )
            .filter((item) => item.visible)
            .map((item) => item.id),
    );
    const actions = [
        ...(shown.has('kiosk') ? [{ value: 'kiosk', label: '展示模式', icon: Expand }] : []),
        { value: 'logout', label: '退出登录', icon: LogOut },
    ];
    const { open, activeIndex, rootRef, triggerProps, listProps, getItemProps } = useDropdown({
        items: actions,
        onChange: (action) => {
            if (action === 'kiosk') {
                enterKiosk();
            } else if (action === 'logout') {
                setConfirmLogout(true);
            }
        },
    });

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
                    <div className="workspace-context-heading">
                        <h1>{meta?.label ?? '控制台'}</h1>
                        {shown.has('status') && (
                            <span
                                className="workspace-connection-state"
                                data-online={status === '已连接'}
                                title={status}
                                role="status"
                            >
                                <span aria-hidden="true" className="workspace-status-dot" />
                                <span className="workspace-status-label">{status}</span>
                            </span>
                        )}
                    </div>
                    <p className="workspace-page-description">{meta?.description}</p>
                </div>
                <div className="workspace-session-actions">
                    <div className="workspace-toolbar-scene">
                        {shown.has('theme') && <ThemeToggle />}
                        <div ref={rootRef} className="workspace-more">
                            <button
                                {...triggerProps}
                                aria-label="会话操作"
                                aria-haspopup="menu"
                                title="会话操作"
                                className="ui-glass workspace-icon-button workspace-more-trigger"
                                data-press-scale=""
                            >
                                <GlassMaterial />
                                <Ellipsis className="size-4" />
                            </button>
                            <AnimatePresence>
                                {open && (
                                    <motion.div
                                        initial={
                                            reduced ? false : { opacity: 0, y: -6, scale: 0.96 }
                                        }
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        transition={
                                            reduced
                                                ? { duration: 0 }
                                                : { type: 'spring', duration: 0.42, bounce: 0.12 }
                                        }
                                        className="ui-glass ui-glass-menu workspace-session-menu"
                                    >
                                        <GlassMaterial />
                                        <ul
                                            {...listProps}
                                            role="menu"
                                            aria-label="会话操作"
                                            className="workspace-theme-options"
                                        >
                                            <motion.li
                                                aria-hidden="true"
                                                role="presentation"
                                                initial={false}
                                                animate={{
                                                    y: Math.max(0, activeIndex) * 44,
                                                    opacity: activeIndex < 0 ? 0 : 1,
                                                }}
                                                transition={
                                                    reduced
                                                        ? { duration: 0 }
                                                        : {
                                                              type: 'spring',
                                                              duration: 0.42,
                                                              bounce: 0.12,
                                                          }
                                                }
                                                className="workspace-theme-active"
                                            />
                                            {actions.map(({ value, label, icon: Icon }, index) => (
                                                <li
                                                    key={value}
                                                    {...getItemProps(index)}
                                                    role="menuitem"
                                                    aria-selected={undefined}
                                                    className="workspace-theme-option"
                                                    data-active={index === activeIndex}
                                                >
                                                    <Icon className="size-4" />
                                                    <span>{label}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                    <IconMorph
                        preset="menu-close"
                        labels={['页面导航', '收起导航']}
                        semantics="expanded"
                        showLabel
                        active={mobileOpen}
                        onActiveChange={(index) => onMobileOpenChange(index === 1)}
                        className="workspace-menu-trigger"
                    />
                </div>
            </div>
            <ConfirmDialog
                open={confirmLogout}
                onOpenChange={setConfirmLogout}
                title="退出登录？"
                description="当前会话将结束。下次进入时，需要再次输入访问密码。"
                confirmText="退出登录"
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
