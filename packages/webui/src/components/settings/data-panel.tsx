import { Clock, RefreshCw } from 'lucide-react';
import { Dropdown } from '@/components/interior/dropdown';
import { NAV_ITEMS } from '@/components/layout/sidebar';
import { Group, Segmented, SettingRow, type Opt } from '@/components/settings/settings-controls';
import { useLayout } from '@/contexts/LayoutContext';
import { POLL_INTERVAL_OPTIONS, useTheme, type TimeFormat } from '@/contexts/ThemeContext';

// ─────────────── 数据与格式 ───────────────

const TIME_FORMAT_OPTIONS: Opt<TimeFormat>[] = [
    { value: '24h', label: '24 小时制' },
    { value: '12h', label: '12 小时制 (AM/PM)' },
];

export function DataPanel() {
    const { appearance, setAppearance } = useTheme();
    const { pages, setPages } = useLayout();
    return (
        <div className="flex flex-col gap-5">
            <Group title="数据刷新" icon={RefreshCw} description="定期更新账号、进程与系统信息。">
                <SettingRow
                    label="轮询间隔"
                    hint={
                        appearance.pollInterval === 0
                            ? '已暂停轮询'
                            : `当前 ${appearance.pollInterval} 毫秒`
                    }
                    layout="stack"
                >
                    <Segmented
                        value={appearance.pollInterval}
                        options={POLL_INTERVAL_OPTIONS.map((o) => ({
                            value: o.value,
                            label: o.value === 0 ? '暂停' : `${o.value / 1000} 秒`,
                        }))}
                        onChange={(pollInterval) => setAppearance({ pollInterval })}
                    />
                </SettingRow>
            </Group>

            <Group title="登录后落地页" description="登录后默认打开的页面。">
                <SettingRow label="默认页面" layout="stack">
                    <Dropdown
                        label="默认页面"
                        value={pages.defaultRoute}
                        items={NAV_ITEMS.map((n) => ({ value: n.to, label: n.label }))}
                        onChange={(defaultRoute) => setPages({ defaultRoute })}
                        className="w-full max-w-xs"
                    />
                </SettingRow>
            </Group>

            <Group title="时间格式" icon={Clock} description="日志与告警等时间戳的显示方式。">
                <SettingRow label="时制" layout="stack">
                    <Segmented
                        value={appearance.timeFormat}
                        options={TIME_FORMAT_OPTIONS}
                        onChange={(timeFormat) => setAppearance({ timeFormat })}
                    />
                </SettingRow>
            </Group>
        </div>
    );
}
