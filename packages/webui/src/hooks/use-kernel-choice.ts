import { useCallback, useEffect, useRef, useState } from 'react';
import { isRealUin } from '@nowluma/common/uin';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { ApiError, useApi, type KernelCatalog, type KernelChoiceInput } from '@/lib/api';
import { readSaveKernelChoiceResult } from '@/lib/api/kernel';

export interface KernelChoiceTarget {
    pid: number;
    path: string;
    uin: string;
    nickname: string;
    injected: boolean;
}

export interface PendingKernelChoice {
    target: KernelChoiceTarget;
    catalog: KernelCatalog;
    confirm(choice: KernelChoiceInput): Promise<void>;
    cancel(): void;
}

export function useKernelChoice() {
    const api = useApi();
    const { runAction } = useActionFeedback();
    const [pending, setPending] = useState<PendingKernelChoice | null>(null);
    const pendingRef = useRef<PendingKernelChoice | null>(null);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            pendingRef.current?.cancel();
        };
    }, []);

    const readTarget = useCallback(
        async (pid: number, signal: AbortSignal) => {
            const processes = await api.processes.list(signal);
            signal.throwIfAborted();
            const matches = processes.filter((process) => process.pid === pid);
            const process = matches.length === 1 ? matches[0] : undefined;
            const uin = process?.account?.uin;

            if (typeof uin !== 'string' || !isRealUin(uin)) {
                throw new ApiError(409, '尚未识别当前 QQ 账号，请先在 QQ 登录后再选择接入内核');
            }

            return {
                pid,
                path: process!.path,
                uin,
                nickname: process!.account!.nickname,
                injected: process!.injected,
            };
        },
        [api],
    );

    const recheckTarget = useCallback(
        async (target: KernelChoiceTarget, signal: AbortSignal) => {
            const current = await readTarget(target.pid, signal);

            if (current.uin !== target.uin || current.path !== target.path) {
                throw new ApiError(409, 'QQ 账号或进程已变化，请为当前账号重新选择接入内核');
            }
        },
        [readTarget],
    );

    const ask = useCallback(
        (
            target: KernelChoiceTarget,
            catalog: KernelCatalog,
            signal: AbortSignal,
            onPolicyWrite?: (writing: boolean) => void,
        ) => {
            if (pendingRef.current) {
                throw new ApiError(409, '请先完成或取消当前账号的内核选择');
            }

            signal.throwIfAborted();
            return new Promise<boolean>((resolve) => {
                let saving = false;

                const finish = (accepted: boolean) => {
                    signal.removeEventListener('abort', cancel);

                    if (pendingRef.current === request) {
                        pendingRef.current = null;

                        if (mounted.current) {
                            setPending(null);
                        }
                    }

                    resolve(accepted);
                };

                const cancel = () => finish(false);
                const request: PendingKernelChoice = {
                    target,
                    catalog,
                    cancel,
                    confirm: async (choice) => {
                        if (
                            saving ||
                            pendingRef.current !== request ||
                            signal.aborted ||
                            !mounted.current
                        ) {
                            return;
                        }

                        if (
                            choice.kernel !== 'compat' ||
                            !choice.riskAccepted ||
                            choice.riskVersion !== catalog.riskVersion
                        ) {
                            throw new ApiError(400, '请主动确认当前版本的兼容内核风险');
                        }

                        saving = true;

                        try {
                            await recheckTarget(target, signal);

                            if (pendingRef.current !== request || !mounted.current) {
                                return;
                            }

                            onPolicyWrite?.(true);

                            try {
                                await runAction(
                                    {
                                        title: '正在保存内核选择',
                                        detail: `QQ ${target.uin}`,
                                        successTitle: '内核选择已保存',
                                        successDetail: `仅对 QQ ${target.uin} 生效`,
                                        errorTitle: '内核选择保存失败',
                                    },
                                    async () => {
                                        const result = readSaveKernelChoiceResult(
                                            await api.kernel.save(target.uin, choice, signal),
                                            choice,
                                        );
                                        signal.throwIfAborted();
                                        return result;
                                    },
                                );
                            } finally {
                                onPolicyWrite?.(false);
                            }

                            if (
                                pendingRef.current === request &&
                                mounted.current &&
                                !signal.aborted
                            ) {
                                finish(true);
                            }
                        } finally {
                            saving = false;
                        }
                    },
                };
                pendingRef.current = request;
                signal.addEventListener('abort', cancel, { once: true });
                setPending(request);
            });
        },
        [api, recheckTarget, runAction],
    );

    const beforeAttach = useCallback(
        async (
            pid: number,
            signal: AbortSignal,
            onPolicyWrite?: (writing: boolean) => void,
        ): Promise<boolean> => {
            try {
                const target = await readTarget(pid, signal);
                const policy = await api.kernel.get(target.uin, signal);
                signal.throwIfAborted();

                if (!mounted.current) {
                    return false;
                }

                if (!policy.canLoad) {
                    const catalog = await api.kernel.catalog(signal);
                    signal.throwIfAborted();

                    if (
                        !mounted.current ||
                        !(await ask(
                            target,
                            { ...catalog, options: policy.options },
                            signal,
                            onPolicyWrite,
                        ))
                    ) {
                        return false;
                    }

                    const savedPolicy = await api.kernel.get(target.uin, signal);
                    signal.throwIfAborted();

                    if (!savedPolicy.canLoad) {
                        throw new ApiError(409, '当前账号的内核选择未生效，请重新确认');
                    }
                }

                // The PID may have changed accounts while the dialog or save was pending.
                await recheckTarget(target, signal);
                return mounted.current && !signal.aborted;
            } catch (error) {
                if (signal.aborted || !mounted.current) {
                    return false;
                }

                throw error;
            }
        },
        [api, ask, readTarget, recheckTarget],
    );

    return { pending, beforeAttach };
}
