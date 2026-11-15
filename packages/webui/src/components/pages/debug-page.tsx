// Debug — a multi-tab developer workspace over /api/debug/*. Workspaces: the
// action tester, the visual message composer, the live activity feed, and an
// embedded API reference (the action library). The browser's 试一下 prefills
// the tester and switches to it. Tester / composer / activity stay MOUNTED so
// the live SSE feed and in-progress edits survive tab switches.
import { useEffect, useState } from 'react';
import { Activity, Library, Send, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs } from '@/components/ui/tabs';
import { GlassMaterial } from '@/components/ui/glass-material';
import { ActionTester } from '@/components/debug/action-tester';
import { MessageComposer } from '@/components/debug/message-composer';
import { LiveActivity } from '@/components/debug/live-activity';
import { ApiBrowser } from '@/components/debug/api-browser';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { useApi } from '@/lib/api';
import type { DebugActionDoc, QQInfo } from '@/types';
import '@/styles/console-pages.css';

type Tab = 'tester' | 'compose' | 'activity' | 'api';

export function DebugPage() {
    const api = useApi();
    const [accounts, setAccounts] = useState<QQInfo[]>([]);
    const [docs, setDocs] = useState<DebugActionDoc[]>([]);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('tester');
    const [preset, setPreset] = useState<{ name: string; nonce: number } | undefined>();

    useEffect(() => {
        void (async () => {
            try {
                const [qq, acts] = await Promise.all([api.qqList(), api.debug.actions()]);
                setAccounts(qq);
                setDocs(acts.actions);
            } catch (error) {
                console.error('load debug tools', error);
                setLoadError(error instanceof Error ? error.message : '加载开发者工具失败');
            } finally {
                setReady(true);
            }
        })();
    }, [api]);

    const tryAction = (name: string) => {
        setPreset((p) => ({ name, nonce: (p?.nonce ?? 0) + 1 }));
        setTab('tester');
    };

    return (
        <div className="cp-page">
            <header className="flex flex-col gap-3">
                <div className="cp-toolbar text-sm text-muted-foreground">
                    <p>选择账号与接口，构建消息并查看实时结果。</p>
                    {ready && (
                        <span className="font-mono text-xs tabular-nums">
                            {accounts.length} 个账号 · {docs.length} 个接口
                        </span>
                    )}
                </div>
                {loadError && (
                    <div
                        role="alert"
                        className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                        {loadError}
                    </div>
                )}
                <div className="ui-glass cp-category-chrome">
                    <GlassMaterial />
                    <Tabs
                        className="border-0"
                        aria-label="调试工具"
                        value={tab}
                        onChange={setTab}
                        items={[
                            {
                                value: 'tester',
                                label: '接口调用',
                                icon: <Terminal className="size-4" />,
                            },
                            {
                                value: 'compose',
                                label: '发送消息',
                                icon: <Send className="size-4" />,
                            },
                            {
                                value: 'activity',
                                label: '活动记录',
                                icon: <Activity className="size-4" />,
                            },
                            {
                                value: 'api',
                                label: '接口库',
                                icon: <Library className="size-4" />,
                                badge: docs.length || undefined,
                            },
                        ]}
                    />
                </div>
            </header>

            <SkeletonSwap
                ready={ready}
                reserve={224}
                lines={8}
                lineHeight={28}
                barHeight={11}
                label="开发者工具数据"
                className={ready ? 'skeleton-swap-fluid' : ''}
            >
                {ready ? (
                    <>
                        {/* Tester / compose / activity stay MOUNTED and toggle via CSS so the
                live feed's SSE never drops (it must capture events fired from other
                tabs) and in-progress params/messages survive a peek at another tab.
                ApiBrowser has no state worth preserving and is heavy (~520 rows), so
                it mounts on demand. */}
                        <div
                            role="tabpanel"
                            aria-label="接口调用"
                            className={cn('min-w-0', tab === 'tester' ? 'cp-fade' : 'hidden')}
                        >
                            <ActionTester accounts={accounts} docs={docs} presetAction={preset} />
                        </div>
                        <div
                            role="tabpanel"
                            aria-label="发送消息"
                            className={cn('min-w-0', tab === 'compose' ? 'cp-fade' : 'hidden')}
                        >
                            <MessageComposer accounts={accounts} />
                        </div>
                        <div
                            role="tabpanel"
                            aria-label="活动记录"
                            className={cn('min-w-0', tab === 'activity' ? 'cp-fade' : 'hidden')}
                        >
                            <LiveActivity />
                        </div>
                        {tab === 'api' && (
                            <div role="tabpanel" aria-label="接口库">
                                <ApiBrowser docs={docs} onTry={tryAction} />
                            </div>
                        )}
                    </>
                ) : null}
            </SkeletonSwap>
        </div>
    );
}
