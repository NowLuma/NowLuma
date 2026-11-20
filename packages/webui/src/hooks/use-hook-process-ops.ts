import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useApi, type ProcessActionResult } from '@/lib/api';

export type HookProcessOpKind = 'load' | 'unload' | 'refresh';

export interface HookProcessOps {
    /** Returns the in-flight op kind for a pid, or null if idle. */
    statusOf(pid: number): HookProcessOpKind | null;
    /** True only for a read/choice wait that unload can replace without interrupting a write. */
    canCancelAttach?(pid: number): boolean;
    /** Latest user-facing status; auto-clears a few seconds after the last update. */
    banner: string;
    load(pid: number): Promise<void>;
    unload(pid: number): Promise<void>;
    refresh(pid: number): Promise<void>;
}

export interface UnloadFailedAlert {
    pid: number;
    error: string;
}

export interface UseHookProcessOpsResult {
    ops: HookProcessOps;
    unloadFailedAlert: UnloadFailedAlert | null;
    dismissUnloadFailedAlert: () => void;
    cancelPending: () => void;
}

interface KindMessages {
    start(pid: number): string;
    ok(pid: number): string;
    fail(message: string): string;
}

const KIND_MESSAGES: Record<HookProcessOpKind, KindMessages> = {
    load: {
        start: (pid) => `正在向进程 ${pid} 加载 Nowluma…`,
        ok: (pid) => `已向进程 ${pid} 注入 Nowluma，等待管道连接…`,
        fail: (m) => `加载失败：${m}`,
    },
    unload: {
        start: (pid) => `正在从进程 ${pid} 卸载…`,
        ok: (pid) => `已从进程 ${pid} 卸载`,
        fail: (m) => `卸载失败：${m}`,
    },
    refresh: {
        start: (pid) => `正在刷新进程 ${pid} 的管道状态…`,
        ok: (pid) => `已刷新进程 ${pid} 的管道状态`,
        fail: (m) => `刷新失败：${m}`,
    },
};

interface ProcessRun {
    controller: AbortController;
    phase: 'authorization' | 'policy' | 'native';
    unloadRequested: boolean;
    queuedUnload?: Promise<void>;
    settled: Promise<void>;
}

const BANNER_CLEAR_MS = 4000;

// Cancellation must settle the gate even if a read's underlying response arrives late.
async function waitForAuthorization(authorization: Promise<boolean>, signal: AbortSignal) {
    let cancel!: () => void;
    const canceled = new Promise<boolean>((resolve) => {
        cancel = () => resolve(false);
        signal.addEventListener('abort', cancel, { once: true });

        if (signal.aborted) {
            cancel();
        }
    });

    try {
        return await Promise.race([authorization, canceled]);
    } finally {
        signal.removeEventListener('abort', cancel);
    }
}

/**
 * Drives load/unload/refresh actions on Hook-target processes. Owns the
 * per-pid inflight dedup, the per-kind status indicator, the banner message
 * lifecycle, and the "unload silently failed" alert that surfaces when the
 * backend reports the named pipe is still alive after an unload attempt.
 */
export function useHookProcessOps(
    opts: {
        onAfterOp?: () => Promise<void> | void;
        beforeAttach?: (
            pid: number,
            signal: AbortSignal,
            onPolicyWrite?: (writing: boolean) => void,
        ) => Promise<boolean>;
    } = {},
): UseHookProcessOpsResult {
    const api = useApi();
    const { runAction } = useActionFeedback();
    const [byPid, setByPid] = useState<Map<number, HookProcessOpKind>>(() => new Map());
    const [banner, setBanner] = useState('');
    const [unloadFailedAlert, setUnloadFailedAlert] = useState<UnloadFailedAlert | null>(null);

    // Synchronous inflight guard — protects against rapid double-clicks that
    // would race the byPid setter (state updates are batched, refs are not).
    const activeRuns = useRef(new Map<number, ProcessRun>());
    const bannerTimerRef = useRef<number | null>(null);
    const onAfterOpRef = useRef(opts.onAfterOp);
    onAfterOpRef.current = opts.onAfterOp;
    const beforeAttachRef = useRef(opts.beforeAttach);
    beforeAttachRef.current = opts.beforeAttach;
    const mounted = useRef(false);

    const cancelPending = useCallback(() => {
        for (const current of activeRuns.current.values()) {
            current.unloadRequested = false;
            current.controller.abort();
        }
    }, []);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            cancelPending();

            if (bannerTimerRef.current != null) {
                window.clearTimeout(bannerTimerRef.current);
            }
        };
    }, [cancelPending]);

    const scheduleBannerClear = useCallback(() => {
        if (bannerTimerRef.current != null) {
            window.clearTimeout(bannerTimerRef.current);
        }

        bannerTimerRef.current = window.setTimeout(() => {
            setBanner('');
            bannerTimerRef.current = null;
        }, BANNER_CLEAR_MS);
    }, []);

    const setKind = useCallback((pid: number, kind: HookProcessOpKind | null) => {
        setByPid((prev) => {
            const next = new Map(prev);

            if (kind == null) {
                next.delete(pid);
            } else {
                next.set(pid, kind);
            }

            return next;
        });
    }, []);

    const run = useCallback(
        async (
            pid: number,
            kind: HookProcessOpKind,
            action: (signal: AbortSignal) => Promise<ProcessActionResult>,
        ): Promise<void> => {
            if (!mounted.current) {
                return;
            }

            const previous = activeRuns.current.get(pid);

            if (previous) {
                if (kind !== 'unload' || previous.phase === 'native') {
                    return;
                }

                if (previous.unloadRequested && previous.queuedUnload) {
                    return previous.queuedUnload;
                }

                previous.unloadRequested = true;

                if (previous.phase === 'policy') {
                    setKind(pid, 'unload');
                    previous.queuedUnload = previous.settled.then(() => {
                        if (
                            !mounted.current ||
                            !previous.unloadRequested ||
                            activeRuns.current.get(pid) !== previous
                        ) {
                            return;
                        }

                        activeRuns.current.delete(pid);
                        return run(pid, 'unload', action);
                    });
                    return previous.queuedUnload;
                }

                previous.controller.abort();
            }

            let complete!: () => void;
            const current: ProcessRun = {
                controller: new AbortController(),
                phase: 'authorization',
                unloadRequested: false,
                settled: new Promise<void>((resolve) => {
                    complete = resolve;
                }),
            };
            const { signal } = current.controller;
            activeRuns.current.set(pid, current);
            setKind(pid, kind);
            const messages = KIND_MESSAGES[kind];
            const feedback = {
                title: messages.start(pid),
                detail: `PID ${pid}`,
                successTitle: messages.ok(pid),
                successDetail: `PID ${pid}`,
                errorTitle: `${kind === 'load' ? '加载' : kind === 'unload' ? '卸载' : '刷新'}失败`,
                resultError: (outcome: ProcessActionResult) =>
                    kind === 'unload' &&
                    outcome.process?.status === 'connecting' &&
                    outcome.process.error
                        ? outcome.process.error
                        : null,
            };
            let actionStarted = false;

            try {
                if (kind !== 'unload' && beforeAttachRef.current) {
                    const allowed = await waitForAuthorization(
                        beforeAttachRef.current(pid, signal, (writing) => {
                            if (activeRuns.current.get(pid) !== current || !mounted.current) {
                                return;
                            }

                            current.phase = writing ? 'policy' : 'authorization';

                            if (!writing && current.unloadRequested) {
                                current.controller.abort();
                            } else {
                                setKind(pid, kind);
                            }
                        }),
                        signal,
                    );

                    if (!allowed) {
                        return;
                    }
                }

                if (signal.aborted || !mounted.current || activeRuns.current.get(pid) !== current) {
                    return;
                }

                current.phase = 'native';
                setKind(pid, kind);
                setBanner(messages.start(pid));
                actionStarted = true;
                const result = await runAction(feedback, async () => {
                    const outcome = await action(signal);
                    signal.throwIfAborted();

                    if (typeof outcome.success !== 'boolean' || outcome.process?.pid !== pid) {
                        throw new Error('未能确认操作结果，请检查当前 QQ 状态');
                    }

                    if (!outcome.success || outcome.process.status === 'error') {
                        throw new Error(outcome.process.error || outcome.message || '操作失败');
                    }

                    return outcome;
                });

                if (signal.aborted || !mounted.current) {
                    return;
                }

                if (
                    kind === 'unload' &&
                    result.process?.status === 'connecting' &&
                    result.process.error
                ) {
                    setUnloadFailedAlert({ pid, error: result.process.error });
                    setBanner(`进程 ${pid} 卸载失败`);
                } else {
                    setBanner(messages.ok(pid));
                }

                await onAfterOpRef.current?.();
            } catch (e) {
                if (signal.aborted || !mounted.current || activeRuns.current.get(pid) !== current) {
                    return;
                }

                if (!actionStarted) {
                    await runAction(feedback, async () => {
                        throw e;
                    }).catch(() => undefined);
                }

                if (!signal.aborted && mounted.current && activeRuns.current.get(pid) === current) {
                    const msg = e instanceof Error ? e.message : '未知错误';
                    setBanner(messages.fail(msg));
                }
            } finally {
                if (activeRuns.current.get(pid) === current && !current.unloadRequested) {
                    activeRuns.current.delete(pid);

                    if (mounted.current) {
                        setKind(pid, null);
                        scheduleBannerClear();
                    }
                }

                complete();
            }
        },
        [setKind, scheduleBannerClear, runAction],
    );

    const load = useCallback(
        (pid: number) => run(pid, 'load', (signal) => api.processes.load(pid, signal)),
        [api, run],
    );
    const unload = useCallback(
        (pid: number) => run(pid, 'unload', (signal) => api.processes.unload(pid, signal)),
        [api, run],
    );
    const refresh = useCallback(
        (pid: number) => run(pid, 'refresh', (signal) => api.processes.refresh(pid, signal)),
        [api, run],
    );

    const statusOf = useCallback(
        (pid: number): HookProcessOpKind | null => byPid.get(pid) ?? null,
        [byPid],
    );

    const canCancelAttach = useCallback((pid: number): boolean => {
        const current = activeRuns.current.get(pid);
        return current?.phase === 'authorization' && !current.unloadRequested;
    }, []);

    const dismissUnloadFailedAlert = useCallback(() => setUnloadFailedAlert(null), []);

    const ops = useMemo<HookProcessOps>(
        () => ({ statusOf, canCancelAttach, banner, load, unload, refresh }),
        [statusOf, canCancelAttach, banner, load, unload, refresh],
    );

    return { ops, unloadFailedAlert, dismissUnloadFailedAlert, cancelPending };
}
