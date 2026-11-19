import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_WEBHOOK_BODY } from '@nowluma/common/notification-templates';
import { Bell, Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Input } from '@/components/ui/input';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useApi } from '@/lib/api';
import { useFlashMessage } from '@/hooks/use-flash-message';
import { cn } from '@/lib/utils';
import {
    notificationChannelType,
    type NotificationChannel,
    type NotificationsConfig,
} from '@/types';
import { NotificationChannelDialog } from './notification-channel-dialog';

/** A fresh channel with a non-colliding default id. */
function blankChannel(existing: NotificationChannel[]): NotificationChannel {
    const used = new Set(existing.map((c) => c.id));
    let n = existing.length + 1;

    while (used.has(`channel-${n}`)) {
        n += 1;
    }

    return {
        id: `channel-${n}`,
        name: '',
        type: 'webhook',
        url: '',
        bodyTemplate: DEFAULT_WEBHOOK_BODY,
        enabled: true,
    };
}

interface DialogState {
    index: number | null; // null → create
    seed: NotificationChannel;
}

export function NotificationsPanel() {
    const api = useApi();
    const { runAction } = useActionFeedback();
    const [config, setConfig] = useState<NotificationsConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [testing, setTesting] = useState<string | null>(null);
    const { msg, flash, setMsg } = useFlashMessage();
    const saveTimer = useRef<number | null>(null);
    const saveGen = useRef(0);

    const load = useCallback(async () => {
        setLoading(true);
        setMsg(null);

        try {
            setConfig(await api.notifications.getConfig());
        } catch (error) {
            console.error('load notifications config failed', error);
            setMsg({ kind: 'err', text: '加载通知配置失败' });
        } finally {
            setLoading(false);
        }
    }, [api, setMsg]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(
        () => () => {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
            }
        },
        [],
    );

    /** Apply locally + debounced auto-save. A generation guard reconciles with
     *  the server's normalized result only if no newer edit landed meanwhile. */
    const commit = (
        next: NotificationsConfig,
        copy: { title: string; successTitle: string } = {
            title: '正在更新通知配置',
            successTitle: '通知配置已更新',
        },
    ) => {
        setConfig(next);
        const gen = ++saveGen.current;

        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }

        saveTimer.current = window.setTimeout(() => {
            saveTimer.current = null;
            void runAction(
                {
                    title: copy.title,
                    detail: '正在同步通知渠道设置',
                    successTitle: copy.successTitle,
                    successDetail: '通知配置已同步',
                    errorTitle: '通知配置更新失败',
                },
                () => api.notifications.saveConfig(next),
            )
                .then((result) => {
                    // Only the latest save reconciles + confirms; a superseded in-flight
                    // save stays silent (its successor will confirm).
                    if (saveGen.current !== gen) {
                        return;
                    }

                    setConfig(result);
                    flash('ok', '已保存');
                })
                .catch((error) => {
                    if (saveGen.current !== gen) {
                        return;
                    }

                    console.error('save notifications config failed', error);
                    setMsg({ kind: 'err', text: error instanceof Error ? error.message : '保存通知配置失败' });
                });
        }, 350);
    };

    if (loading || !config) {
        return (
            <SkeletonSwap
                ready={!loading}
                lines={6}
                lineHeight={26}
                reserve={156}
                label="通知配置"
                className={!loading ? 'skeleton-swap-fluid min-h-[156px]' : ''}
            >
                {!loading && !config ? (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-3 border-b py-4 text-sm text-destructive"
                    >
                        <span>{msg?.text ?? '加载通知配置失败'}</span>
                        <Button variant="outline" size="sm" onClick={() => void load()}>
                            重试
                        </Button>
                    </div>
                ) : null}
            </SkeletonSwap>
        );
    }

    const channels = config.channels;
    const setChannels = (
        next: NotificationChannel[],
        copy?: { title: string; successTitle: string },
    ) => commit({ ...config, channels: next }, copy);
    const otherIds = (index: number | null) =>
        channels.filter((_, i) => i !== index).map((c) => c.id);

    const openCreate = () => setDialog({ index: null, seed: blankChannel(channels) });
    const openEdit = (i: number) => setDialog({ index: i, seed: channels[i] });

    const submitChannel = (ch: NotificationChannel, index: number | null) => {
        if (index === null) {
            setChannels([...channels, ch], {
                title: '正在新增通知渠道',
                successTitle: '通知渠道已新增',
            });
        } else {
            setChannels(
                channels.map((c, idx) => (idx === index ? ch : c)),
                { title: '正在更新通知渠道', successTitle: '通知渠道已更新' },
            );
        }
    };

    const test = async (id: string) => {
        setTesting(id);

        // Persist any pending edit first — the server tests the stored channel by id.
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }

        try {
            const res = await runAction(
                {
                    title: '正在测试通知渠道',
                    detail: id,
                    successTitle: '测试通知已发送',
                    successDetail: id,
                    errorTitle: '通知渠道测试失败',
                    resultError: (result) =>
                        result.success ? null : result.message || '测试发送失败',
                },
                async () => {
                    await api.notifications.saveConfig(config);
                    return api.notifications.test(id);
                },
            );
            if (res.success) {
                flash('ok', res.message ?? '测试发送成功');
            } else {
                setMsg({ kind: 'err', text: res.message || '测试发送失败' });
            }
        } catch (error) {
            console.error('test notification channel failed', error);
            setMsg({ kind: 'err', text: error instanceof Error ? error.message : '测试请求失败' });
        } finally {
            setTesting(null);
        }
    };

    return (
        <SkeletonSwap
            ready
            lines={6}
            lineHeight={26}
            reserve={156}
            label="通知配置"
            className="skeleton-swap-fluid min-h-[156px]"
        >
            <div className="flex min-w-0 flex-col gap-7">
                <Group title="通知策略" icon={Bell}>
                    <SettingRow label="下线等待" hint="下线超过此时长才通知；恢复时再通知。0 表示立即通知。">
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                aria-label="去抖窗口（秒）"
                                min={0}
                                max={3600}
                                className="w-28 tabular-nums"
                                value={config.debounceSeconds}
                                disabled={testing !== null}
                                onChange={(e) => {
                                    const n = Math.trunc(Number(e.target.value));
                                    commit({
                                        ...config,
                                        debounceSeconds: Number.isFinite(n)
                                            ? Math.min(3600, Math.max(0, n))
                                            : 0,
                                    });
                                }}
                            />
                            <span className="text-xs text-muted-foreground">秒</span>
                        </div>
                    </SettingRow>
                </Group>

                <Group title="通知渠道" description="在账号的配置页选择要启用的渠道。">
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <span className="text-xs tabular-nums text-muted-foreground">{channels.length} 个渠道</span>
                        <Button variant="glass" size="sm" onClick={openCreate} disabled={testing !== null}>
                            <Plus className="size-3.5" /> 新增渠道
                        </Button>
                    </div>
                    {channels.length === 0 ? (
                        <p className="py-5 text-sm text-muted-foreground">尚未添加渠道。</p>
                    ) : (
                        <div className="divide-y divide-border/60">
                            {channels.map((ch, i) => (
                                <ChannelRow
                                    key={ch.id}
                                    channel={ch}
                                    testing={testing === ch.id}
                                    disabled={testing !== null}
                                    onToggle={(v) =>
                                        setChannels(
                                            channels.map((c, idx) =>
                                                idx === i ? { ...c, enabled: v } : c,
                                            ),
                                            {
                                                title: '正在更新通知渠道',
                                                successTitle: '通知渠道已更新',
                                            },
                                        )
                                    }
                                    onTest={() => void test(ch.id)}
                                    onEdit={() => openEdit(i)}
                                    onDelete={() =>
                                        setChannels(
                                            channels.filter((_, idx) => idx !== i),
                                            {
                                                title: '正在删除通知渠道',
                                                successTitle: '通知渠道已删除',
                                            },
                                        )
                                    }
                                />
                            ))}
                        </div>
                    )}
                </Group>

                {msg && (
                    <p
                        role={msg.kind === 'ok' ? 'status' : 'alert'}
                        className={cn(
                            'text-xs',
                            msg.kind === 'ok' ? 'text-success' : 'text-destructive',
                        )}
                    >
                        {msg.text}
                    </p>
                )}

                {dialog && (
                    <NotificationChannelDialog
                        open
                        onOpenChange={(open) => !open && setDialog(null)}
                        isEdit={dialog.index != null}
                        initial={dialog.seed}
                        otherIds={otherIds(dialog.index)}
                        onSubmit={(channel) => submitChannel(channel, dialog.index)}
                    />
                )}
            </div>
        </SkeletonSwap>
    );
}

interface ChannelRowProps {
    channel: NotificationChannel;
    testing: boolean;
    disabled: boolean;
    onToggle: (v: boolean) => void;
    onTest: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

/** Info-only row + inline actions. No live-typed fields — editing is the dialog. */
function ChannelRow({ channel, testing, disabled, onToggle, onTest, onEdit, onDelete }: ChannelRowProps) {
    const kind = notificationChannelType(channel);
    return (
        <div className={cn('grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start', !channel.enabled && 'opacity-60')}>
            <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="break-words text-sm font-medium">{channel.name || channel.id}</h3>
                    {channel.name && <code className="break-all text-xs text-muted-foreground">{channel.id}</code>}
                    <span className="text-xs text-muted-foreground">{kind === 'email' ? '邮件' : 'Webhook'}</span>
                    {!channel.enabled && <span className="text-xs text-muted-foreground">已停用</span>}
                </div>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {kind === 'email'
                        ? [channel.to, channel.smtpHost].filter(Boolean).join(' · ')
                        : channel.url}
                </p>
                <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        消息模板
                    </summary>
                    {kind === 'email' && channel.subjectTemplate && (
                        <div className="pb-3">
                            <p className="mb-1 font-medium text-foreground">主题</p>
                            <pre className="max-w-prose whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                                {channel.subjectTemplate}
                            </pre>
                        </div>
                    )}
                    {kind === 'email' && <p className="mb-1 font-medium text-foreground">正文</p>}
                    <pre className="max-w-prose whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                        {channel.bodyTemplate}
                    </pre>
                </details>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <ToggleSwitch
                    value={channel.enabled}
                    onChange={onToggle}
                    ariaLabel={`启用 ${channel.name || channel.id}`}
                    disabled={disabled}
                />
                <Button
                    variant="glass"
                    size="sm"
                    onClick={onTest}
                    disabled={disabled}
                    aria-label={`测试发送 ${channel.name || channel.id}`}
                    className="text-muted-foreground hover:text-foreground"
                >
                    {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="optical-forward size-4" />}
                    测试
                </Button>
                <Button variant="glass" size="sm" onClick={onEdit} disabled={disabled} aria-label={`编辑 ${channel.name || channel.id}`}>
                    <Pencil className="size-4" /> 编辑
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    aria-label={`删除 ${channel.name || channel.id}`}
                    disabled={disabled}
                    className="text-muted-foreground hover:text-destructive"
                >
                    <Trash2 className="size-4" /> 删除
                </Button>
            </div>
        </div>
    );
}
