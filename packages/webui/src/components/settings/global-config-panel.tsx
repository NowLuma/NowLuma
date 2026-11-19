import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, KeyRound, Music, Plus, RefreshCw, Trash2, Video } from 'lucide-react';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Button } from '@/components/ui/button';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Input } from '@/components/ui/input';
import { DropdownSelect } from '@/components/ui/dropdown-select';
import { Label } from '@/components/ui/label';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useApi } from '@/lib/api';
import { useFlashMessage } from '@/hooks/use-flash-message';
import { cn } from '@/lib/utils';
import type { GlobalSettings } from '@/types';

const MUSIC_SIGN_DEFAULT = 'https://ss.xingzhige.com/music_card/card';

function isHttpUrl(value: string): boolean {
    try {
        const u = new URL(value);
        return (u.protocol === 'http:' || u.protocol === 'https:') && u.host.length > 0;
    } catch {
        return false;
    }
}

export function GlobalConfigPanel() {
    const id = useId();
    const api = useApi();
    const { runAction } = useActionFeedback();
    const [config, setConfig] = useState<GlobalSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const { msg, flash, setMsg } = useFlashMessage();
    const saveTimer = useRef<number | null>(null);
    const saveGen = useRef(0);

    const load = useCallback(async () => {
        setLoading(true);

        try {
            setConfig(await api.globalConfig.get());
        } catch (error) {
            console.error('load global config failed', error);
            setMsg({ kind: 'err', text: error instanceof Error ? error.message : '加载全局配置失败' });
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

    // Keep partially typed URLs in the draft until the next load.
    const commit = (
        next: GlobalSettings,
        feedback: false | { title: string; successTitle: string } = {
            title: '正在更新全局配置',
            successTitle: '全局配置已更新',
        },
    ) => {
        setConfig(next);
        const gen = ++saveGen.current;

        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }

        saveTimer.current = window.setTimeout(() => {
            saveTimer.current = null;
            const dropped =
                next.rkey.fallbackServers.some((s) => s.trim() && !isHttpUrl(s.trim())) ||
                (next.musicSignUrl.trim().length > 0 && !isHttpUrl(next.musicSignUrl.trim()));
            const save =
                feedback === false
                    ? api.globalConfig.save(next)
                    : runAction(
                          {
                              title: feedback.title,
                              successTitle: feedback.successTitle,
                              successDetail: dropped ? '已保存，无效项已忽略' : '配置已同步',
                              errorTitle: '全局配置更新失败',
                          },
                          () => api.globalConfig.save(next),
                      );
            void save
                .then(() => {
                    if (saveGen.current !== gen) {
                        return;
                    }

                    flash('ok', dropped ? '已保存（无效项已忽略）' : '已保存');
                })
                .catch((error) => {
                    if (saveGen.current !== gen) {
                        return;
                    }

                    console.error('save global config failed', error);
                    setMsg({ kind: 'err', text: error instanceof Error ? error.message : '保存全局配置失败' });
                });
        }, 500);
    };

    if (loading || !config) {
        return (
            <SkeletonSwap
                ready={!loading}
                lines={6}
                lineHeight={26}
                reserve={156}
                label="全局配置"
                className={!loading ? 'skeleton-swap-fluid min-h-[156px]' : ''}
            >
                {!loading ? (
                    <div role="alert" className="flex flex-wrap items-center gap-3 border-b py-5 text-muted-foreground">
                        <AlertTriangle className="size-4 shrink-0" />
                        <p className="text-sm text-destructive">{msg?.text ?? '加载全局配置失败'}</p>
                        <Button variant="glass" size="sm" onClick={() => void load()}>
                            <RefreshCw className="size-3.5" /> 重试
                        </Button>
                    </div>
                ) : null}
            </SkeletonSwap>
        );
    }

    const servers = config.rkey.fallbackServers;
    const setServers = (next: string[]) =>
        commit({ ...config, rkey: { fallbackServers: next } }, false);

    return (
        <SkeletonSwap
            ready
            lines={6}
            lineHeight={26}
            reserve={156}
            label="全局配置"
            className="skeleton-swap-fluid min-h-[156px]"
        >
            <div className="flex min-w-0 flex-col gap-7">
                <Group
                    title="rkey 回退"
                    icon={KeyRound}
                    description="内核无法取得 rkey 时，按顺序请求回退服务。留空关闭。"
                >
                    <div className="flex min-w-0 flex-col gap-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Label>rkey 回退服务器</Label>
                            <Button
                                variant="glass"
                                size="sm"
                                onClick={() => setServers([...servers, ''])}
                            >
                                <Plus className="size-3.5" /> 添加
                            </Button>
                        </div>

                        {servers.length === 0 ? (
                            <p className="py-3 text-xs text-muted-foreground">
                                回退服务器未启用
                            </p>
                        ) : (
                            <ol className="flex min-w-0 flex-col divide-y divide-border/60">
                                {servers.map((url, i) => {
                                    const invalid = url.trim().length > 0 && !isHttpUrl(url.trim());
                                    return (
                                        <li key={i} className="flex min-w-0 items-center gap-2 py-2">
                                            <span aria-hidden="true" className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                                            <Input
                                                type="url"
                                                aria-label={`rkey 回退服务器 ${i + 1}`}
                                                inputMode="url"
                                                spellCheck={false}
                                                placeholder="https://your-rkey-server.example/rkeys"
                                                value={url}
                                                aria-invalid={invalid}
                                                className={cn(
                                                    'font-mono text-xs',
                                                    invalid &&
                                                        'border-destructive focus-visible:ring-destructive',
                                                )}
                                                onChange={(e) =>
                                                    setServers(
                                                        servers.map((s, idx) =>
                                                            idx === i ? e.target.value : s,
                                                        ),
                                                    )
                                                }
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`移除 rkey 回退服务器 ${i + 1}`}
                                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                                onClick={() =>
                                                    setServers(
                                                        servers.filter((_, idx) => idx !== i),
                                                    )
                                                }
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                        <details className="text-xs text-muted-foreground">
                            <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                服务接口要求
                            </summary>
                            <p className="max-w-prose leading-relaxed">
                                建议使用自建服务，仅支持 HTTP(S)。端点需返回{' '}
                                <code className="break-all font-mono">
                                    {'{ group_rkey, private_rkey, expired_time }'}
                                </code>。
                            </p>
                        </details>
                    </div>
                </Group>

                <Group title="视频上传" icon={Video}>
                    <SettingRow label="上传连接数" hint="对所有账号的下一次视频上传生效。">
                        <DropdownSelect
                            ariaLabel="视频上传连接数"
                            value={String(config.videoUploadConcurrency ?? 1)}
                            options={[
                                { value: '1', label: '1 路（默认）' },
                                { value: '2', label: '2 路' },
                                { value: '3', label: '3 路' },
                                { value: '4', label: '4 路' },
                            ]}
                            onChange={(value) =>
                                commit({ ...config, videoUploadConcurrency: Number(value) })
                            }
                        />
                    </SettingRow>
                    <details className="py-3 text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            并发策略
                        </summary>
                        <p className="max-w-prose leading-relaxed">
                            小视频使用单连接。多路上传取决于网络和服务器，拥塞时会降低并发。
                        </p>
                    </details>
                </Group>
                <Group title="音乐分享" icon={Music} description="签名服务对所有账号生效。">
                    <SettingRow label="签名服务地址" hint="留空使用内置服务。">
                        <Input
                            type="url"
                            inputMode="url"
                            spellCheck={false}
                            id={`${id}-music`}
                            aria-label="签名服务地址"
                            placeholder={MUSIC_SIGN_DEFAULT}
                            value={config.musicSignUrl}
                            aria-invalid={
                                config.musicSignUrl.trim().length > 0 &&
                                !isHttpUrl(config.musicSignUrl.trim())
                            }
                            className={cn(
                                'font-mono text-xs',
                                config.musicSignUrl.trim().length > 0 &&
                                    !isHttpUrl(config.musicSignUrl.trim()) &&
                                    'border-destructive focus-visible:ring-destructive',
                            )}
                            onChange={(e) => commit({ ...config, musicSignUrl: e.target.value })}
                        />
                    </SettingRow>
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
            </div>
        </SkeletonSwap>
    );
}
