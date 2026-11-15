import {
    ArrowDown,
    ArrowUp,
    Bug,
    Check,
    Eye,
    EyeOff,
    GripVertical,
    LayoutDashboard,
    Lock,
    Pin,
    PinOff,
    PlugZap,
    Settings,
    Sparkles,
    SlidersHorizontal,
    Terminal,
} from 'lucide-react';
import { motion, Reorder, useDragControls, useReducedMotionConfig } from 'motion/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { GlassMaterial } from '@/components/ui/glass-material';
import { cn } from '@/lib/utils';
import { BRAND_LOGO_URL } from '@/brand';
import { APP_NAME, APP_VERSION } from '@/types';
import { useAppState } from '@/contexts/AppStateContext';
import { useTheme } from '@/contexts/ThemeContext';
import { reconcileLayoutItems, useLayout } from '@/contexts/LayoutContext';
import type { AppPath } from '@/router';
import type { UiLayoutItem } from '@/types';

export interface NavItem {
    to: AppPath;
    label: string;
    icon: typeof LayoutDashboard;
    description: string;
}

export const NAV_ITEMS: NavItem[] = [
    { to: '/', label: '总览', icon: LayoutDashboard, description: '主机与服务状态' },
    { to: '/processes', label: 'QQ 连接', icon: PlugZap, description: '连接 / 断开 / 登录' },
    { to: '/config', label: '节点配置', icon: Settings, description: 'OneBot 协议端点' },
    { to: '/logs', label: '日志', icon: Terminal, description: '实时事件流' },
    { to: '/debug', label: '调试', icon: Bug, description: '测试台与实时活动' },
    { to: '/settings', label: '系统设置', icon: SlidersHorizontal, description: '主题与账号' },
];

// These routes keep the layout editor and account settings reachable.
export const PINNED_NAV: AppPath[] = ['/', '/settings'];

function useNavigationItems() {
    const { navItems, setNavItems, editing, setEditing } = useLayout();
    const reconciled = reconcileLayoutItems(
        navItems,
        NAV_ITEMS.map((item) => item.to),
        PINNED_NAV,
    );
    const orderedNav = reconciled
        .filter((item) => item.visible)
        .map((item) => NAV_ITEMS.find((meta) => meta.to === item.id))
        .filter((item): item is NavItem => !!item);

    const reorderNav = (ids: string[]) => {
        const byId = new Map(reconciled.map((item) => [item.id, item]));
        setNavItems(ids.map((id) => byId.get(id)).filter((item): item is UiLayoutItem => !!item));
    };

    const toggleNav = (id: string) =>
        setNavItems(
            reconciled.map((item) => (item.id === id ? { ...item, visible: !item.visible } : item)),
        );
    return { reconciled, orderedNav, reorderNav, toggleNav, editing, setEditing };
}

function NavReorderRow({
    item,
    meta,
    first,
    last,
    onToggle,
    onMove,
}: {
    item: UiLayoutItem;
    meta: NavItem;
    first: boolean;
    last: boolean;
    onToggle: (id: string) => void;
    onMove: (direction: -1 | 1) => void;
}) {
    const controls = useDragControls();
    const Icon = meta.icon;
    const pinned = PINNED_NAV.includes(meta.to);
    return (
        <Reorder.Item
            value={item.id}
            dragListener={false}
            dragControls={controls}
            className={cn('workspace-nav-edit-row', !item.visible && 'opacity-50')}
        >
            <button
                type="button"
                aria-label={`拖动排序：${meta.label}`}
                className="workspace-icon-button touch-none text-muted-foreground"
                onPointerDown={(event) => controls.start(event)}
            >
                <GripVertical className="size-4" />
            </button>
            <Icon className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
            <span className="min-w-0 flex-1 truncate text-sm">{meta.label}</span>
            <button
                type="button"
                aria-label={`上移${meta.label}`}
                className="workspace-icon-button"
                disabled={first}
                onClick={() => onMove(-1)}
            >
                <ArrowUp className="size-4" />
            </button>
            <button
                type="button"
                aria-label={`下移${meta.label}`}
                className="workspace-icon-button"
                disabled={last}
                onClick={() => onMove(1)}
            >
                <ArrowDown className="size-4" />
            </button>
            {pinned ? (
                <span
                    title="必选项，不可隐藏"
                    className="grid size-11 shrink-0 place-items-center text-muted-foreground"
                >
                    <Lock className="size-3.5" />
                </span>
            ) : (
                <button
                    type="button"
                    onClick={() => onToggle(item.id)}
                    aria-label={`${item.visible ? '隐藏' : '显示'}${meta.label}`}
                    className="workspace-icon-button"
                >
                    {item.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
            )}
        </Reorder.Item>
    );
}

export function NavigationDock() {
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const { appearance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const { orderedNav } = useNavigationItems();

    return (
        <div className="workspace-dock-anchor">
            <div className="workspace-dock-scene">
                <nav
                    aria-label="主导航"
                    data-ui-surface="chrome"
                    data-labels-pinned={appearance.sidebarPinned}
                    className="ui-glass workspace-dock"
                    style={{ gridTemplateColumns: `repeat(${orderedNav.length}, minmax(0, 1fr))` }}
                >
                    <GlassMaterial />
                    {orderedNav.map(({ to, label, icon: Icon, description }) => {
                        const active = pathname === to;
                        return (
                            <Link
                                key={to}
                                to={to}
                                title={description}
                                aria-current={active ? 'page' : undefined}
                                className="ui-nav-item workspace-dock-link"
                                data-press-scale=""
                            >
                                {active && (
                                    <motion.span
                                        layoutId={
                                            reduced ? undefined : 'workspace-active-navigation'
                                        }
                                        className="ui-nav-highlight workspace-dock-active"
                                        transition={
                                            reduced
                                                ? { duration: 0 }
                                                : { type: 'spring', duration: 0.42, bounce: 0.18 }
                                        }
                                    />
                                )}
                                <Icon className="workspace-dock-icon size-4" />
                                <span className="workspace-dock-copy">
                                    <span className="workspace-dock-label">{label}</span>
                                    <span className="workspace-dock-description">
                                        {description}
                                    </span>
                                </span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}

export function Sidebar({ onItemClick }: { onItemClick?: () => void }) {
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const { updateInfo } = useAppState();
    const { appearance, setAppearance } = useTheme();
    const { reconciled, orderedNav, reorderNav, toggleNav, editing, setEditing } =
        useNavigationItems();

    const moveNav = (index: number, direction: -1 | 1) => {
        const ids = reconciled.map((item) => item.id);
        const target = index + direction;

        if (target < 0 || target >= ids.length) {
            return;
        }

        [ids[index], ids[target]] = [ids[target], ids[index]];
        reorderNav(ids);
    };

    return (
        <div data-ui-surface="chrome" className="workspace-navigation-panel">
            <div className="workspace-navigation-brand">
                <img src={BRAND_LOGO_URL} alt="" className="size-9 rounded-md" />
                <div className="min-w-0">
                    <p className="font-semibold tracking-tight">
                        {APP_NAME}{' '}
                        <span className="font-mono text-xs font-normal text-muted-foreground">
                            v{APP_VERSION}
                        </span>
                    </p>
                    <p className="text-xs text-muted-foreground">QQ 连接控制台</p>
                </div>
            </div>
            <div className="workspace-navigation-scroll">
                {editing ? (
                    <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-sm font-medium">编辑导航</span>
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                className="workspace-text-button"
                            >
                                <Check className="size-4" /> 完成
                            </button>
                        </div>
                        <Reorder.Group
                            axis="y"
                            values={reconciled.map((item) => item.id)}
                            onReorder={reorderNav}
                            className="space-y-1"
                        >
                            {reconciled.map((item, index) => {
                                const meta = NAV_ITEMS.find((entry) => entry.to === item.id);
                                return meta ? (
                                    <NavReorderRow
                                        key={item.id}
                                        item={item}
                                        meta={meta}
                                        first={index === 0}
                                        last={index === reconciled.length - 1}
                                        onToggle={toggleNav}
                                        onMove={(direction) => moveNav(index, direction)}
                                    />
                                ) : null;
                            })}
                        </Reorder.Group>
                    </div>
                ) : (
                    <nav aria-label="全部页面" className="space-y-1">
                        {orderedNav.map(({ to, label, icon: Icon, description }) => (
                            <Link
                                key={to}
                                to={to}
                                onClick={onItemClick}
                                aria-current={pathname === to ? 'page' : undefined}
                                className="ui-nav-item workspace-navigation-link"
                            >
                                <Icon className="size-4 shrink-0" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium">{label}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {description}
                                    </span>
                                </span>
                            </Link>
                        ))}
                    </nav>
                )}
                {updateInfo?.hasUpdate && (
                    <Link
                        to="/settings"
                        search={{ tab: 'about' }}
                        onClick={onItemClick}
                        aria-label="有可用更新"
                        className="workspace-update-link"
                    >
                        <Sparkles className="size-4" />
                        <span>有新版本可用 {updateInfo.latest && `· v${updateInfo.latest}`}</span>
                    </Link>
                )}
            </div>
            <div className="workspace-navigation-footer">
                {!editing && (
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="workspace-text-button"
                    >
                        <Settings className="size-4" /> 编辑导航
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setAppearance({ sidebarPinned: !appearance.sidebarPinned })}
                    aria-label="显示导航说明"
                    aria-pressed={appearance.sidebarPinned}
                    title="在宽屏导航中显示页面用途"
                    className="workspace-text-button"
                >
                    {appearance.sidebarPinned ? (
                        <Pin className="size-4" />
                    ) : (
                        <PinOff className="size-4" />
                    )}
                    显示导航说明
                </button>
            </div>
        </div>
    );
}
