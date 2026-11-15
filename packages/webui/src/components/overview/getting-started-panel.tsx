// 首页「接下来做什么」面板。
//
// 只消费 AppStateContext 已有的数据 + 面板自己的选择，新增零个后端接口。
// 位置固定在首次使用提示条那里：它不属于可编辑网格部件，所以隐藏所有卡片后
// 引导仍然在（这是首用必须能看见的东西）。
import { useMemo, useState } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { Link } from '@tanstack/react-router';
import {
    AlertCircle,
    ArrowRight,
    Check,
    ChevronRight,
    Loader2,
    PlugZap,
    RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Modal } from '@/components/interior/modal';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { cn } from '@/lib/utils';
import { nextStep, pickTargetProcess, type StepAction, type StepView } from '@/lib/next-step';
import { DesktopButton } from '@/components/desktop-button';
import { useAppState } from '@/contexts/AppStateContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { HookProcessInfo } from '@/types';

export function GettingStartedPanel() {
    const {
        resources,
        processList,
        qqList,
        connections,
        processOps,
        selectedUin,
        setSelectedUin,
        refreshProcesses,
        refreshQqList,
        refreshConnections,
    } = useAppState();
    const { appearance } = useTheme();
    const reduced = useReducedMotionConfig();
    const off = reduced || appearance.reduceMotion || appearance.disableMotion;

    // 面板自己选定的 PID。不放进全局状态：这是引导过程里的临时选择。
    const [selectedPid, setSelectedPid] = useState<number | null>(null);
    const [picking, setPicking] = useState(false);
    const [details, setDetails] = useState<StepView | null>(null);
    const [confirmLoad, setConfirmLoad] = useState<HookProcessInfo | null>(null);

    const target = useMemo(
        () => pickTargetProcess(processList, selectedPid, selectedUin).target,
        [processList, selectedPid, selectedUin],
    );

    const pendingOp = target ? processOps.statusOf(target.pid) : null;

    const step = nextStep(
        {
            ready: {
                processList: resources.processList.ready,
                qqList: resources.qqList.ready,
                connections: resources.connections.ready,
            },
            errors: {
                processList: resources.processList.error ?? '',
                qqList: resources.qqList.error ?? '',
                connections: resources.connections.error ?? '',
            },
            processList,
            qqList,
            connections,
            selectedPid,
            pendingOp,
        },
        selectedUin,
    );

    const refreshAll = () => {
        refreshProcesses();
        refreshQqList();
        refreshConnections();
    };

    const run = (action: StepAction) => {
        switch (action) {
            case 'refresh-all':
                if (step.id === 'selection-lost') {
                    setSelectedPid(null);
                }

                refreshAll();
                return;

            case 'refresh':
                if (target) {
                    void processOps.refresh(target.pid);
                }

                refreshAll();
                return;

            case 'load':
                if (target) {
                    setSelectedPid(target.pid);
                    setConfirmLoad(target);
                }

                return;

            case 'choose-qq':
                setPicking(true);
                refreshAll();
                return;

            case 'details':
                setDetails(step);
                return;

            case 'open-config':
                return;
        }
    };

    const busy = step.action === null;
    const alertError = step.error.trim().length > 0;

    return (
        <>
            <motion.section
                aria-label="连接工作流"
                initial={off ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: off ? 0 : 0.16 }}
                aria-busy={step.id === 'reading'}
                className="workspace-connection-workflow"
            >
                <div className="workspace-workflow-layout">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                        <div
                            className={cn(
                                'workspace-workflow-icon',
                                step.done
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-primary/15 text-primary',
                            )}
                        >
                            {step.done ? (
                                <Check className="size-5" />
                            ) : busy ? (
                                <Loader2 className="size-5 animate-spin" />
                            ) : (
                                <PlugZap className="size-5" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="workspace-eyebrow">接下来做什么</p>
                            <SkeletonSwap
                                ready={step.id !== 'reading'}
                                lines={1}
                                lineHeight={20}
                                reserve={20}
                                label="下一步提示"
                            >
                                <h3 className="mt-2 text-lg font-medium leading-snug sm:text-xl">
                                    {step.title}
                                </h3>
                            </SkeletonSwap>
                            {step.hint && (
                                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                                    {step.hint}
                                </p>
                            )}
                            {alertError && (
                                <p
                                    role="alert"
                                    className="mt-1.5 whitespace-pre-line break-words text-xs leading-relaxed text-destructive"
                                >
                                    {step.error}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="workspace-workflow-actions">
                        <DesktopButton />

                        {step.action === 'open-config' ? (
                            <Button size="sm" asChild>
                                <Link
                                    to="/config"
                                    onClick={() => target?.loggedIn && setSelectedUin(target.uin)}
                                >
                                    {step.actionLabel}
                                    <ChevronRight className="size-3.5" />
                                </Link>
                            </Button>
                        ) : step.action ? (
                            <Button
                                size="sm"
                                variant={step.done ? 'outline' : 'default'}
                                disabled={pendingOp !== null}
                                onClick={() => run(step.action!)}
                            >
                                {step.action === 'refresh-all' && (
                                    <RefreshCw className="size-3.5" />
                                )}
                                {step.actionLabel}
                                {step.action === 'choose-qq' ? null : (
                                    <ArrowRight className="size-3.5" />
                                )}
                            </Button>
                        ) : (
                            <Button size="sm" disabled>
                                <Loader2 className="size-3.5 animate-spin" />
                                {step.actionLabel}
                            </Button>
                        )}
                    </div>
                </div>
            </motion.section>

            {/* 多进程选择：不批量接入，只让用户点一个。 */}
            <Modal
                open={picking}
                onClose={() => setPicking(false)}
                title="选择要使用的 QQ"
                description="一次只接一个账号。"
            >
                <div className="flex flex-col gap-2">
                    {processList.length === 0 ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="size-4" />
                            现在没有检测到 QQ，先打开并登录 QQ 再回来。
                        </p>
                    ) : (
                        processList.map((proc) => (
                            <button
                                key={proc.pid}
                                type="button"
                                onClick={() => {
                                    setSelectedPid(proc.pid);
                                    setPicking(false);
                                }}
                                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">
                                        {proc.account?.nickname || proc.uin || proc.name}
                                    </span>
                                    <span className="block truncate font-mono text-meta text-muted-foreground">
                                        PID {proc.pid}
                                        {proc.uin ? ` · QQ ${proc.uin}` : ''}
                                    </span>
                                </span>
                                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                            </button>
                        ))
                    )}
                </div>
            </Modal>

            {/* 说明与原因：错误必须看得见，不能只活在自动消失的通知里。 */}
            <Modal
                open={details !== null}
                onClose={() => setDetails(null)}
                title={details?.done ? '接好之后呢' : '这一步的原因'}
                description={details?.title}
            >
                {details?.done ? (
                    <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
                        <p>
                            这个页面负责把 QQ 接上，并把消息转成标准格式。
                            <strong>它不负责自动回复</strong>
                            —— 回复逻辑写在你的机器人程序里。
                        </p>
                        <p>
                            如果你的程序还没连上来，去「配置」新建一个连接，把它给出的地址填进你的程序。
                        </p>
                        <p className="text-xs">
                            提示：连接状态显示正常，只说明服务在监听或已连上，不代表你的程序一定能收到消息。
                        </p>
                    </div>
                ) : (
                    <p
                        role="alert"
                        className="whitespace-pre-line break-words rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    >
                        {details?.error || '没有更多信息，请查看「日志」页。'}
                    </p>
                )}
            </Modal>

            <ConfirmDialog
                open={confirmLoad !== null}
                onOpenChange={(open) => !open && setConfirmLoad(null)}
                title="连接这个 QQ？"
                description={
                    confirmLoad
                        ? `将把 PID ${confirmLoad.pid} 的 QQ 接到本程序，之后它会读取这个账号的消息。`
                        : ''
                }
                confirmText="连接"
                onConfirm={async () => {
                    if (confirmLoad) {
                        await processOps.load(confirmLoad.pid);
                    }
                }}
            />
        </>
    );
}
