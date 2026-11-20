import { useEffect, useRef, useState } from 'react';
import { NATIVE_KERNEL_LABEL } from '@nowluma/common/kernel-display';
import { isRealUin } from '@nowluma/common/uin';
import { Dropdown } from '@/components/interior/dropdown';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { useWizardNavigation } from '@/components/interior/wizard-steps';
import { Button } from '@/components/ui/button';
import { KernelCatalogPreview, KernelChoiceForm } from '@/components/kernel-choice';
import { actionErrorMessage, useActionFeedback } from '@/contexts/ActionFeedbackContext';
import {
    ApiError,
    useApi,
    type AccountKernelPolicy,
    type KernelCatalog,
    type KernelChoiceInput,
} from '@/lib/api';
import { readSaveKernelChoiceResult } from '@/lib/api/kernel';

type DetectedAccount = { uin: string; nickname: string };

export function KernelOnboardingStep({ replay }: { replay: boolean }) {
    const api = useApi();
    const { next } = useWizardNavigation();
    const { runAction } = useActionFeedback();
    const [catalog, setCatalog] = useState<KernelCatalog | null>(null);
    const [accounts, setAccounts] = useState<DetectedAccount[]>([]);
    const [selectedUin, setSelectedUin] = useState<string | null>(null);
    const [policy, setPolicy] = useState<AccountKernelPolicy | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const selected = useRef(selectedUin);
    selected.current = selectedUin;
    const saveController = useRef<AbortController | null>(null);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            saveController.current?.abort();
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        setCatalog(null);
        setPolicy(null);
        setError(null);
        setSelectedUin(null);
        selected.current = null;

        void (async () => {
            try {
                const nextCatalog = await api.kernel.catalog(signal);
                const processes = replay ? [] : await api.processes.list(signal);
                signal.throwIfAborted();
                const detected = new Map<string, DetectedAccount>();

                for (const process of processes) {
                    if (
                        process.account &&
                        typeof process.account.uin === 'string' &&
                        isRealUin(process.account.uin)
                    ) {
                        detected.set(process.account.uin, process.account);
                    }
                }

                const nextAccounts = [...detected.values()];
                setCatalog(nextCatalog);
                setAccounts(nextAccounts);
                const uin = nextAccounts.length === 1 ? nextAccounts[0].uin : null;
                selected.current = uin;
                setSelectedUin(uin);
            } catch (error) {
                if (!signal.aborted) {
                    setError(actionErrorMessage(error));
                }
            }
        })();

        return () => controller.abort();
    }, [api, replay, retry]);

    useEffect(() => {
        if (replay || !selectedUin || !catalog) {
            return;
        }

        const controller = new AbortController();
        const { signal } = controller;
        setPolicy(null);
        setError(null);
        void api.kernel
            .get(selectedUin, signal)
            .then((value) => {
                if (!signal.aborted && selected.current === selectedUin) {
                    setPolicy(value);
                }
            })
            .catch((error) => {
                if (!signal.aborted && selected.current === selectedUin) {
                    setError(actionErrorMessage(error));
                }
            });

        return () => controller.abort();
    }, [api, catalog, replay, selectedUin]);

    const save = async (choice: KernelChoiceInput) => {
        const uin = selectedUin;

        if (
            !uin ||
            !isRealUin(uin) ||
            replay ||
            !mounted.current ||
            selected.current !== uin ||
            saveController.current
        ) {
            throw new ApiError(400, '请先选择当前 QQ 账号');
        }

        const controller = new AbortController();
        const { signal } = controller;
        saveController.current = controller;

        try {
            await runAction(
                {
                    title: '正在保存内核选择',
                    detail: `QQ ${uin}`,
                    successTitle: '内核选择已保存',
                    successDetail: `仅对 QQ ${uin} 生效`,
                    errorTitle: '内核选择保存失败',
                },
                async () => {
                    const processes = await api.processes.list(signal);
                    signal.throwIfAborted();

                    if (!processes.some((process) => process.account?.uin === uin)) {
                        throw new ApiError(409, 'QQ 账号已变化，请重新选择当前账号');
                    }

                    const result = readSaveKernelChoiceResult(
                        await api.kernel.save(uin, choice, signal),
                        choice,
                    );
                    signal.throwIfAborted();

                    if (selected.current !== uin || !mounted.current) {
                        throw new DOMException('内核选择已取消', 'AbortError');
                    }

                    return result;
                },
            );

            if (mounted.current && !signal.aborted && selected.current === uin) {
                next();
            }
        } catch (error) {
            if (mounted.current && !signal.aborted && selected.current === uin) {
                setError(actionErrorMessage(error));
            }

            throw error;
        } finally {
            saveController.current = null;
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-2 sm:py-5">
            <header className="space-y-1">
                <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">
                    选择接入内核
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    {replay
                        ? '本次演练只预览，不会保存账号选择或接入 QQ。'
                        : '每个 QQ 账号分别选择，保存选择不会自动接入。'}
                </p>
            </header>
            {error ? (
                <div className="space-y-3">
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setRetry((value) => value + 1)}
                    >
                        重新加载
                    </Button>
                </div>
            ) : (
                <SkeletonSwap ready={catalog !== null} lines={4} reserve={176} label="接入内核">
                    {catalog ? (
                        replay || accounts.length === 0 ? (
                            <div className="space-y-5">
                                <KernelCatalogPreview catalog={catalog} />
                                {!replay ? (
                                    <p className="text-sm text-muted-foreground">
                                        尚未检测到 QQ 账号，QQ 登录后再为该账号选择接入内核。
                                    </p>
                                ) : null}
                                <Button
                                    type="button"
                                    onClick={next}
                                    className="h-11 w-full sm:w-auto"
                                >
                                    {replay ? '继续演练' : '继续'}
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <Dropdown
                                    label="QQ 账号"
                                    placeholder="选择 QQ 账号"
                                    value={selectedUin ?? ''}
                                    items={accounts.map((account) => ({
                                        value: account.uin,
                                        label: `${account.nickname || 'QQ'} · ${account.uin}`,
                                    }))}
                                    disabled={submitting}
                                    className="w-full"
                                    onChange={(uin) => {
                                        saveController.current?.abort();
                                        selected.current = uin;
                                        setPolicy(null);
                                        setError(null);
                                        setSelectedUin(uin);
                                    }}
                                />
                                {selectedUin ? (
                                    <SkeletonSwap
                                        ready={policy !== null}
                                        lines={4}
                                        reserve={240}
                                        label="账号内核选择"
                                    >
                                        {policy ? (
                                            policy.canLoad ? (
                                                <div className="space-y-4">
                                                    <KernelCatalogPreview catalog={catalog} />
                                                    <p className="text-sm">
                                                        QQ {selectedUin} 已保存{' '}
                                                        {NATIVE_KERNEL_LABEL}选择。
                                                    </p>
                                                    <Button
                                                        type="button"
                                                        onClick={next}
                                                        className="h-11"
                                                    >
                                                        继续
                                                    </Button>
                                                </div>
                                            ) : (
                                                <KernelChoiceForm
                                                    key={`${selectedUin}:${catalog.riskVersion}`}
                                                    uin={selectedUin}
                                                    catalog={{
                                                        ...catalog,
                                                        options: policy.options,
                                                    }}
                                                    submitLabel="确认并继续"
                                                    onConfirm={save}
                                                    onSubmittingChange={setSubmitting}
                                                />
                                            )
                                        ) : null}
                                    </SkeletonSwap>
                                ) : (
                                    <KernelCatalogPreview catalog={catalog} />
                                )}
                            </div>
                        )
                    ) : null}
                </SkeletonSwap>
            )}
        </div>
    );
}
