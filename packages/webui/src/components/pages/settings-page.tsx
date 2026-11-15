import { motion, useReducedMotionConfig } from 'motion/react';
import {
    Bell,
    Bug,
    Code2,
    HardDrive,
    Info,
    Palette,
    RefreshCw,
    Server,
    ShieldCheck,
    SlidersHorizontal,
    type Sun,
} from 'lucide-react';
import { AboutPanel } from '@/components/settings/about-panel';
import { AccountPanel } from '@/components/settings/account-panel';
import { AdvancedPanel } from '@/components/settings/advanced-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { DataPanel } from '@/components/settings/data-panel';
import { DeveloperPanel } from '@/components/settings/developer-panel';
import { GlobalConfigPanel } from '@/components/settings/global-config-panel';
import { NotificationsPanel } from '@/components/settings/notifications-panel';
import { StoragePanel } from '@/components/settings/storage-panel';
import { SystemPanel } from '@/components/settings/system-panel';
import { cn } from '@/lib/utils';
import { settingsRoute, type SettingsTab } from '@/router';

interface TabDef {
    key: SettingsTab;
    label: string;
    icon: typeof Sun;
}

// Three domains, rendered as macOS System-Settings-style sidebar sections:
// the dashboard itself (控制台), the all-accounts Nowluma protocol runtime,
// and the host/deployment (平台). Section headers show on the desktop rail
// only; the mobile strip stays a flat wrap.
const TAB_GROUPS: { title: string; tabs: TabDef[] }[] = [
    {
        title: '控制台',
        tabs: [
            { key: 'appearance', label: '外观', icon: Palette },
            { key: 'data', label: '数据与格式', icon: RefreshCw },
            { key: 'account', label: '账号安全', icon: ShieldCheck },
        ],
    },
    {
        title: 'Nowluma',
        tabs: [
            { key: 'globalConfig', label: '全局配置', icon: SlidersHorizontal },
            { key: 'storage', label: '存储管理', icon: HardDrive },
            { key: 'notifications', label: '通知', icon: Bell },
        ],
    },
    {
        title: '平台',
        tabs: [
            { key: 'system', label: '服务', icon: Server },
            { key: 'advanced', label: '高级', icon: Code2 },
            { key: 'developer', label: '开发者', icon: Bug },
            { key: 'about', label: '关于', icon: Info },
        ],
    },
];

const TABS: TabDef[] = TAB_GROUPS.flatMap((g) => g.tabs);

export function SettingsPage() {
    // Active tab lives in the URL (`?tab=`) so it's deep-linkable — e.g. the
    // sidebar update banner jumps straight to 关于. Default tab omits the param.
    const { tab: urlTab } = settingsRoute.useSearch();
    const navigate = settingsRoute.useNavigate();
    const tab: SettingsTab = urlTab ?? 'appearance';
    const setTab = (t: SettingsTab) =>
        void navigate({
            to: '/settings',
            search: t === 'appearance' ? {} : { tab: t },
            replace: true,
        });
    const reduced = useReducedMotionConfig();
    const active = TABS.find((t) => t.key === tab);

    return (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
            <SettingsNav tab={tab} onChange={setTab} />

            <div className="min-w-0 flex-1">
                <motion.div
                    key={tab}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.16 }}
                    className="flex flex-col gap-5"
                >
                    <h2 className="ui-page-title px-0.5">{active?.label}</h2>
                    {tab === 'appearance' && <AppearancePanel />}
                    {tab === 'data' && <DataPanel />}
                    {tab === 'advanced' && <AdvancedPanel />}
                    {tab === 'account' && <AccountPanel />}
                    {tab === 'system' && <SystemPanel />}
                    {tab === 'storage' && <StoragePanel />}
                    {tab === 'notifications' && <NotificationsPanel />}
                    {tab === 'globalConfig' && <GlobalConfigPanel />}
                    {tab === 'developer' && <DeveloperPanel />}
                    {tab === 'about' && <AboutPanel />}
                </motion.div>
            </div>
        </div>
    );
}

// ─────────────── nav: sticky rail (desktop) / scroll strip (mobile) ───────────────

function SettingsNav({ tab, onChange }: { tab: SettingsTab; onChange: (t: SettingsTab) => void }) {
    return (
        <nav
            data-ui-surface="panel"
            aria-label="设置导航"
            className={cn(
                'flex flex-wrap gap-1 p-1.5',
                'lg:w-52 lg:shrink-0 lg:flex-col lg:flex-nowrap lg:self-start lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-y-contain',
            )}
        >
            {TAB_GROUPS.map((group, gi) => (
                <div
                    key={group.title}
                    role="group"
                    aria-labelledby={`settings-nav-group-${gi}`}
                    className="contents lg:flex lg:flex-col lg:gap-1"
                >
                    <p
                        id={`settings-nav-group-${gi}`}
                        className={cn(
                            'hidden select-none px-3 pb-0.5 text-xs font-medium tracking-wide text-muted-foreground lg:block',
                            gi === 0 ? 'lg:pt-1' : 'lg:pt-3',
                        )}
                    >
                        {group.title}
                    </p>
                    {group.tabs.map((t) => {
                        const Icon = t.icon;
                        const active = tab === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => onChange(t.key)}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'inline-flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[4px] px-3 py-2 text-sm font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-full',
                                    active
                                        ? 'bg-accent text-foreground'
                                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                                )}
                            >
                                <Icon className={cn('size-4 shrink-0', active && 'text-primary')} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            ))}
        </nav>
    );
}
