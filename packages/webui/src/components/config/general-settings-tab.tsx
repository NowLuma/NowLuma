import { useId } from 'react';
import { History, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { NotificationOptIn } from '@/components/config/notification-opt-in';
import type { OneBotConfig, StatusCommandConfig } from '@/types';

interface GeneralSettingsTabProps {
    config: OneBotConfig;
    onChange: (next: OneBotConfig) => void;
}

export function GeneralSettingsTab({ config, onChange }: GeneralSettingsTabProps) {
    const id = useId();
    const sc = config.statusCommand;
    const setStatusCommand = (patch: Partial<StatusCommandConfig>) =>
        onChange({ ...config, statusCommand: { ...sc, ...patch } });

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <Group title="登录与记录" icon={History} description="补齐最近会话的本地历史。">
                <SettingRow
                    label="登录时同步云端历史"
                    hint="下次登录或重启生效。每次最多同步 3 个群和 3 个好友，各 20 条；自动请求间隔至少 2 秒。仅写入本地历史，不重放事件、不改变已读状态。"
                    layout="inline"
                >
                    <ToggleSwitch
                        value={config.historySync.enabled}
                        onChange={(enabled) => onChange({ ...config, historySync: { enabled } })}
                        ariaLabel="登录时补齐云端历史记录"
                    />
                </SettingRow>
            </Group>

            <Group
                title="状态回复"
                icon={MessageSquare}
                description="收到触发词时，回复版本、平台与运行时长。"
            >
                <SettingRow
                    label="启用状态回复"
                    hint="任何人均可触发。关闭后完全不响应。"
                    layout="inline"
                >
                    <ToggleSwitch
                        value={sc.enabled}
                        onChange={(enabled) => setStatusCommand({ enabled })}
                        ariaLabel={`启用 ${sc.trigger} 状态命令`}
                    />
                </SettingRow>
                <SettingRow
                    label="触发词"
                    hint="默认 #nl，最长 32 字符。匹配时忽略首尾空格与大小写。"
                    layout="stack"
                >
                    <Label htmlFor={`${id}-trigger`} className="sr-only">触发词</Label>
                    <Input
                        id={`${id}-trigger`}
                        className="max-w-sm font-mono"
                        value={sc.trigger}
                        disabled={!sc.enabled}
                        maxLength={32}
                        onChange={(e) => setStatusCommand({ trigger: e.target.value })}
                    />
                </SettingRow>
                <SettingRow
                    label="回复冷却（秒）"
                    hint="同一会话在冷却期间不重复回复。0 表示不限。"
                    layout="stack"
                >
                    <Label htmlFor={`${id}-cooldown`} className="sr-only">回复冷却（秒）</Label>
                    <Input
                        id={`${id}-cooldown`}
                        type="number"
                        min={0}
                        className="max-w-sm tabular-nums"
                        value={sc.cooldownSeconds}
                        disabled={!sc.enabled}
                        onChange={(e) => {
                            const n = Math.trunc(Number(e.target.value));
                            setStatusCommand({
                                cooldownSeconds: Number.isFinite(n) && n >= 0 ? n : 0,
                            });
                        }}
                    />
                </SettingRow>
                <SettingRow
                    label="拦截已命中的消息"
                    hint="不再转发给下游 Bot，仍会回复并记录。"
                    layout="inline"
                >
                    <ToggleSwitch
                        value={sc.swallow}
                        onChange={(swallow) => setStatusCommand({ swallow })}
                        ariaLabel={`吞掉 ${sc.trigger} 不转发给下游`}
                        disabled={!sc.enabled}
                    />
                </SettingRow>
            </Group>

            <NotificationOptIn
                selectedIds={config.notifications?.channelIds ?? []}
                onChange={(channelIds) => onChange({ ...config, notifications: { channelIds } })}
            />
        </div>
    );
}
