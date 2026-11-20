import { useId } from 'react';
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
import '@/styles/console-pages.css';

interface TabDef {
    key: SettingsTab;
    label: string;
    icon: typeof Sun;
}

// These categories belong only to Settings. Every key remains URL-addressable;
// the compact document index stays visible without a second scrolling region.
const TABS: TabDef[] = [
    { key: 'appearance', label: '外观', icon: Palette },
    { key: 'data', label: '数据与格式', icon: RefreshCw },
    { key: 'account', label: '账号安全', icon: ShieldCheck },
    { key: 'globalConfig', label: '全局配置', icon: SlidersHorizontal },
    { key: 'storage', label: '存储管理', icon: HardDrive },
    { key: 'notifications', label: '通知', icon: Bell },
    { key: 'system', label: '服务', icon: Server },
    { key: 'advanced', label: '高级', icon: Code2 },
    { key: 'developer', label: '开发者', icon: Bug },
    { key: 'about', label: '关于', icon: Info },
];

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

    return (
        <div className="cp-page cp-settings">
            <header className="border-b border-border pb-4">
                <h2 className="text-lg font-semibold tracking-tight">控制台偏好</h2>
                <p className="mt-1 text-sm text-muted-foreground">外观、数据与服务设置。</p>
            </header>
            <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
                <SettingsNav tab={tab} onChange={setTab} />
                <section
                    key={tab}
                    aria-label={TABS.find((item) => item.key === tab)?.label}
                    className="cp-settings-content cp-fade flex min-w-0 flex-col gap-5"
                >
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
                </section>
            </div>
        </div>
    );
}

export function SettingsNav({
    tab,
    onChange,
}: {
    tab: SettingsTab;
    onChange: (tab: SettingsTab) => void;
}) {
    const id = useId();
    const reduced = useReducedMotionConfig();

    return (
        <nav aria-label="设置导航" className="min-w-0 lg:border-r lg:border-border lg:pr-5">
            <div className="grid min-w-0 grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
                {TABS.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.key;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => onChange(item.key)}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                                'relative flex min-h-11 min-w-0 items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50',
                                active ? 'font-semibold text-foreground' : 'text-muted-foreground',
                            )}
                        >
                            {active && (
                                <motion.span
                                    aria-hidden="true"
                                    layoutId={reduced ? undefined : `settings-category-${id}`}
                                    className="absolute inset-y-2 left-0 w-0.5 bg-foreground"
                                    transition={
                                        reduced
                                            ? { duration: 0 }
                                            : { duration: 0.42, ease: [0.16, 1, 0.3, 1] }
                                    }
                                />
                            )}
                            <Icon aria-hidden="true" className="size-4 shrink-0" />
                            <span className="min-w-0 break-words">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
