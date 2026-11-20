// The selected PID owns every detail and action; sorting or a disappearing
// process must never retarget an operation to another QQ process.
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { AlertCircle, Cpu, Info, Loader2, PlugZap, RefreshCw, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/interior/segmented-control';
import { DesktopButton } from '@/components/desktop-button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { cn } from '@/lib/utils';
import type { HookProcessInfo } from '@/types';
import { useAppState } from '@/contexts/AppStateContext';
import { useLayout } from '@/contexts/LayoutContext';
import '@/styles/console-pages.css';

const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'pid', label: 'PID' },
    { value: 'name', label: '名称' },
    { value: 'status', label: '状态' },
];

function qqAvatarUrl(uin: string) {
    return `/avatar/${encodeURIComponent(uin)}`;
}

// Online-first, then by how actionable the state is.
const STATUS_ORDER: Record<HookProcessInfo['status'], number> = {
    online: 0,
    loaded: 1,
    connecting: 2,
    loading: 3,
    available: 4,
    disconnected: 5,
    error: 6,
};

const processStatusLabel: Record<HookProcessInfo['status'], string> = {
    available: '可加载',
    loading: '加载中',
    connecting: '等待连接',
    loaded: '等待登录',
    online: '已在线',
    error: '错误',
    disconnected: '已断开',
};

function processStatusClass(status: HookProcessInfo['status']) {
    if (status === 'online') {
        return 'text-success';
    }

    if (status === 'error' || status === 'disconnected') {
        return 'text-destructive';
    }

    return 'text-muted-foreground';
}

/** Locally detected identity (QQ's own account data), never a login claim. */
function detectedIdentity(proc: HookProcessInfo): { uin: string; nickname: string } | null {
    const uin = proc.loggedIn ? proc.uin : (proc.account?.uin ?? '');

    if (!uin) {
        return null;
    }

    const nickname = proc.account?.uin === uin ? (proc.account?.nickname ?? '') : '';
    return { uin, nickname };
}

export function ProcessesPage() {
    const { processList, processOps, refreshProcesses, resources } = useAppState();
    const { statusOf, banner: processActionStatus, load, unload, refresh } = processOps;
    const { pages, setPages } = useLayout();
    const [selectedPid, setSelectedPid] = useState<number | null>(() =>
        processList.length === 1 ? processList[0]!.pid : null,
    );
    const reduced = useReducedMotionConfig();
    useEffect(() => {
        if (selectedPid === null && processList.length === 1) {
            setSelectedPid(processList[0]!.pid);
        }
    }, [processList, selectedPid]);
    const [confirm, setConfirm] = useState<{
        pid: number;
        name: string;
    } | null>(null);
    const sortKey = pages.processesSort;
    const sorted = useMemo(() => {
        const arr = [...processList];

        if (sortKey === 'name') {
            arr.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortKey === 'status') {
            arr.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.pid - b.pid);
        } else {
            arr.sort((a, b) => a.pid - b.pid);
        }

        return arr;
    }, [processList, sortKey]);

    const selected = sorted.find((proc) => proc.pid === selectedPid) ?? null;

    return (
        <div className="cp-page">
            <header className="cp-document-header">
                <div className="cp-toolbar">
                    <div className="min-w-0">
                        <h2 className="cp-page-heading">QQ 进程</h2>
                        <p className="cp-lede">选择实际 PID，查看账号识别与接入状态。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <DesktopButton />
                        <Button
                            variant="glass"
                            size="sm"
                            onClick={refreshProcesses}
                            disabled={!resources.processList.ready}
                        >
                            <RefreshCw className="size-3.5" /> 刷新
                        </Button>
                    </div>
                </div>
                <AnimatePresence initial={false}>
                    {processActionStatus && (
                        <motion.div
                            key="process-action-status"
                            initial={
                                reduced ? false : { height: 0, opacity: 0, marginTop: '-0.75rem' }
                            }
                            animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
                            exit={{ height: 0, opacity: 0, marginTop: '-0.75rem' }}
                            transition={{ duration: reduced ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
                            className="overflow-hidden"
                        >
                            <div
                                role="status"
                                aria-live="polite"
                                aria-atomic="true"
                                className="cp-inline-notice"
                            >
                                <Info aria-hidden="true" className="size-3.5 shrink-0" />
                                {processActionStatus}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                {resources.processList.error && processList.length > 0 && (
                    <div
                        role="alert"
                        className="cp-inline-notice text-destructive"
                    >
                        {resources.processList.error}；当前显示上次成功读取的进程状态。
                    </div>
                )}
            </header>

            <SkeletonSwap
                ready={resources.processList.ready}
                reserve={192}
                lines={6}
                lineHeight={32}
                barHeight={10}
                label="进程列表"
                className={resources.processList.ready ? 'skeleton-swap-fluid min-h-[192px]' : ''}
            >
                {resources.processList.ready ? (
                    resources.processList.error && processList.length === 0 ? (
                        <div
                            role="alert"
                            className="cp-empty-state text-destructive"
                        >
                            <AlertCircle className="size-8 opacity-70" strokeWidth={1.5} />
                            <p className="text-sm">{resources.processList.error}</p>
                            <Button variant="glass" size="sm" onClick={refreshProcesses}>
                                <RefreshCw className="size-3.5" /> 重试
                            </Button>
                        </div>
                    ) : processList.length === 0 ? (
                        <div className="cp-empty-state text-muted-foreground">
                            <Cpu className="size-8 opacity-40" strokeWidth={1.5} />
                            <p className="text-sm">未检测到可加载 QQ 主进程</p>
                            <p className="text-xs text-muted-foreground/80">启动 QQ 后刷新</p>
                        </div>
                    ) : (
                        <div className="cp-split">
                            {/* master: compact process list */}
                            <section aria-label="进程列表" className="cp-panel cp-process-list">
                                <div className="cp-panel-head">
                                    <h2 className="text-sm font-semibold">
                                        进程{' '}
                                        <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
                                            {sorted.length}
                                        </span>
                                    </h2>
                                    {processList.length > 1 && (
                                        <SegmentedControl
                                            label="排序方式"
                                            value={sortKey}
                                            options={SORT_OPTIONS}
                                            onValueChange={(processesSort) =>
                                                setPages({ processesSort })
                                            }
                                        />
                                    )}
                                </div>
                                <div>
                                    {sorted.map((proc) => {
                                        const identity = detectedIdentity(proc);
                                        const isCurrent = selected?.pid === proc.pid;
                                        return (
                                            <button
                                                key={proc.pid}
                                                type="button"
                                                onClick={() => setSelectedPid(proc.pid)}
                                                aria-current={isCurrent ? 'true' : undefined}
                                                aria-label={`选择进程 PID ${proc.pid}${identity ? `，QQ ${identity.uin}` : ''}`}
                                                className="cp-row cp-process-row outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset"
                                            >
                                                {isCurrent && (
                                                    <span
                                                        aria-hidden="true"
                                                        className="cp-process-indicator"
                                                    />
                                                )}
                                                {identity ? (
                                                    <Avatar size={28}>
                                                        <AvatarImage
                                                            src={qqAvatarUrl(identity.uin)}
                                                            alt={identity.nickname || identity.uin}
                                                        />
                                                        <AvatarFallback>
                                                            {(
                                                                identity.nickname || identity.uin
                                                            ).slice(0, 2)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ) : (
                                                    <div
                                                        className={cn(
                                                            'flex size-7 shrink-0 items-center justify-center text-muted-foreground',
                                                            proc.status === 'error' && 'text-destructive',
                                                        )}
                                                    >
                                                        {proc.status === 'error' ? (
                                                            <AlertCircle className="size-4.5" />
                                                        ) : (
                                                            <Cpu className="size-4.5" />
                                                        )}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                                                        <span className="min-w-0 break-words text-sm font-medium">
                                                            {identity?.nickname ||
                                                                identity?.uin ||
                                                                proc.name}
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                'shrink-0 text-xs',
                                                                processStatusClass(proc.status),
                                                            )}
                                                        >
                                                            {processStatusLabel[proc.status]}
                                                        </span>
                                                    </div>
                                                    <div className="mt-0.5 break-words font-mono text-meta text-muted-foreground tabular-nums">
                                                        PID {proc.pid}
                                                        {identity ? ` · QQ ${identity.uin}` : ''}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            {/* details: selected process facts + actions */}
                            {selected ? (
                                <ProcessDetail
                                    key={selected.pid}
                                    proc={selected}
                                    statusOf={statusOf}
                                    canCancelAttach={processOps.canCancelAttach}
                                    onLoad={() => void load(selected.pid)}
                                    onUnload={() =>
                                        setConfirm({
                                            pid: selected.pid,
                                            name: selected.name || `PID ${selected.pid}`,
                                        })
                                    }
                                    onRefreshPipe={() => refresh(selected.pid)}
                                />
                            ) : (
                                <section
                                    aria-label="进程详情"
                                    className="cp-panel cp-empty-state text-muted-foreground"
                                >
                                    <Cpu className="size-8 opacity-40" strokeWidth={1.5} />
                                    <h2 className="text-base font-medium text-foreground">
                                        {selectedPid === null
                                            ? '选择一个进程'
                                            : `进程 ${selectedPid} 已不在列表中`}
                                    </h2>
                                    <p className="text-sm">
                                        从进程列表选择后，查看详情并执行操作。
                                    </p>
                                </section>
                            )}
                        </div>
                    )
                ) : null}
            </SkeletonSwap>

            <ConfirmDialog
                open={!!confirm}
                onOpenChange={(o) => !o && setConfirm(null)}
                title="确认卸载 Nowluma？"
                description={
                    confirm
                        ? `将从进程 ${confirm.name} 卸载 Nowluma 注入，可能导致当前会话断开。`
                        : ''
                }
                confirmText="卸载"
                destructive
                onConfirm={async () => {
                    if (confirm) {
                        await unload(confirm.pid);
                    }
                }}
            />
        </div>
    );
}

// ─────────────── details pane ───────────────

interface ProcessDetailProps {
    proc: HookProcessInfo;
    statusOf: (pid: number) => 'load' | 'unload' | 'refresh' | null | undefined;
    canCancelAttach?: (pid: number) => boolean;
    onLoad: () => void;
    onUnload: () => void;
    onRefreshPipe: () => void;
}

function ProcessDetail({
    proc,
    statusOf,
    canCancelAttach,
    onLoad,
    onUnload,
    onRefreshPipe,
}: ProcessDetailProps) {
    const identity = detectedIdentity(proc);
    const name = identity?.nickname || identity?.uin || proc.name;
    const op = statusOf(proc.pid);
    const loading = op === 'load' || proc.status === 'loading';
    const unloading = op === 'unload';
    const refreshing = op === 'refresh';
    const busy = op != null || proc.status === 'loading';
    const canUnload = proc.injected;
    // Refresh is meaningful whenever a hook may exist (so the user can re-check
    // the pipe and trigger a reconnect on demand).
    const showRefresh =
        proc.injected || proc.status === 'connecting' || proc.status === 'disconnected';

    return (
        <section aria-label="进程详情" className="cp-panel cp-process-detail">
            <div className="cp-toolbar">
                <div className="flex min-w-0 items-center gap-3">
                    {identity ? (
                        <Avatar size={32}>
                            <AvatarImage
                                src={qqAvatarUrl(identity.uin)}
                                alt={identity.nickname || identity.uin}
                            />
                            <AvatarFallback>
                                {(identity.nickname || identity.uin).slice(0, 2)}
                            </AvatarFallback>
                        </Avatar>
                    ) : (
                        <Cpu className="size-6 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                        <h3 className="break-words text-lg font-semibold tracking-tight">{name}</h3>
                        <p className="break-words font-mono text-xs text-muted-foreground tabular-nums">
                            PID {proc.pid}
                            {identity ? ` · QQ ${identity.uin}` : ''}
                        </p>
                    </div>
                </div>
                <span className={cn('text-sm font-medium', processStatusClass(proc.status))}>
                    {processStatusLabel[proc.status]}
                </span>
            </div>

            <div className="cp-document-actions">
                {showRefresh && (
                    <Button
                        variant="glass"
                        size="sm"
                        disabled={busy}
                        aria-label={`刷新进程 ${proc.pid} 管道状态`}
                        title="刷新管道状态 / 重连"
                        onClick={onRefreshPipe}
                    >
                        {refreshing ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="size-3.5" />
                        )}
                        刷新管道
                    </Button>
                )}
                <Button
                    size="sm"
                    variant={canUnload ? 'outline' : 'glass'}
                    disabled={busy && !(canUnload && canCancelAttach?.(proc.pid))}
                    onClick={canUnload ? onUnload : onLoad}
                    className={cn(
                        canUnload &&
                            'text-destructive hover:bg-destructive/10 hover:text-destructive',
                    )}
                >
                    {(loading || unloading) && <Loader2 className="size-3.5 animate-spin" />}
                    {!loading &&
                        !unloading &&
                        (canUnload ? <Unplug className="size-4" /> : <PlugZap className="size-4" />)}
                    {canUnload
                        ? unloading
                            ? '卸载中'
                            : '卸载'
                        : loading
                          ? '加载中'
                          : '加载'}
                </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
                {canUnload
                    ? '卸载仅作用于此 PID，并会断开当前会话。'
                    : '向此 PID 加载 Nowluma；账号确认与内核选择仍由接入流程处理。'}
            </p>

            <dl className="cp-facts">
                <div className="cp-fact-row">
                    <dt>进程</dt>
                    <dd className="break-all">{proc.name}</dd>
                </div>
                <div className="cp-fact-row">
                    <dt>账号</dt>
                    <dd>
                        <span className="font-mono">{identity?.uin || '未识别'}</span>
                        {identity && !proc.loggedIn && (
                            <span className="ml-2 text-xs text-muted-foreground">
                                本地识别，尚未确认登录
                            </span>
                        )}
                    </dd>
                </div>
                <div className="cp-fact-row">
                    <dt>接入状态</dt>
                    <dd>{proc.injected ? 'Nowluma 已加载' : '尚未加载'}</dd>
                </div>
                <div className="cp-fact-row">
                    <dt>会话连接</dt>
                    <dd>{proc.connected ? '已建立连接' : '尚未连接'}</dd>
                </div>
                {proc.path && (
                    <div className="cp-fact-row">
                        <dt>路径</dt>
                        <dd className="break-all font-mono text-xs leading-relaxed">{proc.path}</dd>
                    </div>
                )}
                {proc.error && (
                    <div role="alert" className="cp-fact-row text-destructive">
                        <dt>错误</dt>
                        <dd className="break-all">{proc.error}</dd>
                    </div>
                )}
            </dl>
        </section>
    );
}
