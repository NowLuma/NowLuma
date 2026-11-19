// Developer workbench over the real debug API. Editors and activity stay
// mounted across local navigation; the reference retains state after its
// first visit. Prefilling the tester cannot replace an in-flight invocation.
import { useEffect, useState } from 'react';
import { Activity, Library, Send, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs } from '@/components/ui/tabs';
import { GlassSurface } from '@/components/ui/glass-material';
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
    const [apiOpened, setApiOpened] = useState(false);
    const [testerInvoking, setTesterInvoking] = useState(false);
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
        if (testerInvoking) {
            return;
        }

        setPreset((p) => ({ name, nonce: (p?.nonce ?? 0) + 1 }));
        setTab('tester');
    };

    return (
        <div className="cp-page">
            <header className="cp-document-header">
                <div className="cp-toolbar">
                    <div className="min-w-0">
                        <h2 className="cp-page-heading">开发者工具</h2>
                        <p className="cp-lede">选择实际账号调用接口，构建消息并阅读运行结果。</p>
                    </div>
                    {ready && (
                        <span className="cp-runtime-context font-mono tabular-nums">
                            {accounts.length} 个账号 · {docs.length} 个接口
                            {testerInvoking && <span role="status">调用进行中</span>}
                        </span>
                    )}
                </div>
                {loadError && (
                    <div
                        role="alert"
                        className="cp-inline-notice text-destructive"
                    >
                        {loadError}
                    </div>
                )}
                <GlassSurface className="cp-category-chrome">
                    <Tabs
                        className="border-0"
                        aria-label="调试工具"
                        value={tab}
                        onChange={(next) => {
                            setTab(next);

                            if (next === 'api') {
                                setApiOpened(true);
                            }
                        }}
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
                </GlassSurface>
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
                        {/* Editors remain mounted during local navigation. The activity
                            subscription deliberately captures calls from the other tabs. */}
                        <div
                            role="tabpanel"
                            aria-label="接口调用"
                            hidden={tab !== 'tester'}
                            inert={tab !== 'tester'}
                            className={cn('min-w-0', tab === 'tester' && 'cp-fade')}
                        >
                            <ActionTester
                                accounts={accounts}
                                docs={docs}
                                presetAction={preset}
                                onInvokingChange={setTesterInvoking}
                            />
                        </div>
                        <div
                            role="tabpanel"
                            aria-label="发送消息"
                            hidden={tab !== 'compose'}
                            inert={tab !== 'compose'}
                            className={cn('min-w-0', tab === 'compose' && 'cp-fade')}
                        >
                            <MessageComposer accounts={accounts} />
                        </div>
                        <div
                            role="tabpanel"
                            aria-label="活动记录"
                            hidden={tab !== 'activity'}
                            inert={tab !== 'activity'}
                            className={cn('min-w-0', tab === 'activity' && 'cp-fade')}
                        >
                            <LiveActivity />
                        </div>
                        {apiOpened && (
                            <div
                                role="tabpanel"
                                aria-label="接口库"
                                hidden={tab !== 'api'}
                                inert={tab !== 'api'}
                                className={cn('min-w-0', tab === 'api' && 'cp-fade')}
                            >
                                <ApiBrowser docs={docs} onTry={tryAction} tryDisabled={testerInvoking} />
                            </div>
                        )}
                    </>
                ) : null}
            </SkeletonSwap>
        </div>
    );
}
