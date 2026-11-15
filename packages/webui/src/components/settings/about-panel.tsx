import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
    Bug,
    Check,
    ExternalLink,
    Github,
    Loader2,
    RefreshCw,
    Sparkles,
    Star,
    Tag,
    type Sun,
} from 'lucide-react';
import { BRAND_LOGO_URL } from '@/brand';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { UpdateInstaller } from '@/components/settings/update-installer';
import { UpdateSources } from '@/components/settings/update-sources';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useAppState } from '@/contexts/AppStateContext';
import { APP_VERSION } from '@/types';

// ─────────────── 关于 ───────────────

const REPO_URL = 'https://github.com/WSXYT/Nowluma';

function UpdateGroup() {
    const { updateInfo, refreshUpdate, resources } = useAppState();
    const { runAction } = useActionFeedback();
    const [checking, setChecking] = useState(false);

    const onCheck = async () => {
        setChecking(true);

        try {
            await runAction(
                {
                    title: '正在检查更新',
                    detail: `当前版本 v${APP_VERSION}`,
                    successTitle: '更新检查完成',
                    successDetail: (result) =>
                        result?.hasUpdate && result.latest
                            ? `发现新版本 v${result.latest}`
                            : '当前已是最新版本',
                    errorTitle: '更新检查失败',
                    resultError: (result) => {
                        if (!result) {
                            return '更新检查未返回结果';
                        }

                        if (result.error === 'disabled') {
                            return '更新检查已关闭';
                        }

                        return result.error || null;
                    },
                },
                () => refreshUpdate(true),
            );
        } catch (error) {
            console.error('manual update check failed', error);
        } finally {
            setChecking(false);
        }
    };

    const disabledCheck = updateInfo?.error === 'disabled';

    let status: ReactNode;

    if (!updateInfo && resources.updateInfo.error) {
        status = <span className="text-muted-foreground">无法检查</span>;
    } else if (!updateInfo) {
        status = null;
    } else if (disabledCheck) {
        status = <span className="text-muted-foreground">检查已关闭</span>;
    } else if (updateInfo.error) {
        status = <span className="text-muted-foreground">无法检查</span>;
    } else if (updateInfo.hasUpdate && updateInfo.latest) {
        status = <span className="font-medium text-primary">发现新版本</span>;
    } else {
        status = (
            <span className="inline-flex items-center gap-1.5 text-success">
                <Check className="size-3.5" /> 已是最新
            </span>
        );
    }

    // Rich detail block, only when an update is available (narrows `latest`).
    let detail: ReactNode = null;

    if (updateInfo?.hasUpdate && updateInfo.latest) {
        const latest = updateInfo.latest;
        detail = (
            <div className="bg-primary/[0.05] px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <span className="text-sm font-medium">v{latest}</span>
                    {updateInfo.publishedAt && (
                        <span className="ml-auto text-meta tabular-nums text-muted-foreground">
                            {new Date(updateInfo.publishedAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    当前 v{updateInfo.current} → 最新 v{latest}
                </p>
                {updateInfo.notes && (
                    <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                        {updateInfo.notes}
                    </pre>
                )}
                {updateInfo.htmlUrl && (
                    <Button asChild size="sm" className="mt-3">
                        <a href={updateInfo.htmlUrl} target="_blank" rel="noreferrer noopener">
                            <ExternalLink className="size-4" /> 发布说明
                        </a>
                    </Button>
                )}
            </div>
        );
    }

    return (
        <Group title="软件更新" icon={Sparkles}>
            <SettingRow label="当前版本" layout="inline">
                <code className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs tabular-nums">
                    v{APP_VERSION}
                </code>
            </SettingRow>
            <SettingRow label="检查更新">
                <div className="flex items-center gap-2.5 text-[12px]">
                    <SkeletonSwap
                        ready={resources.updateInfo.ready}
                        reserve={24}
                        lines={1}
                        lineHeight={24}
                        barHeight={8}
                        label="更新状态"
                        className={
                            resources.updateInfo.ready
                                ? 'skeleton-swap-fluid min-h-6 min-w-24'
                                : 'w-24'
                        }
                    >
                        {resources.updateInfo.ready ? status : null}
                    </SkeletonSwap>
                    {!disabledCheck && (
                        <Button variant="outline" size="sm" onClick={onCheck} disabled={checking}>
                            {checking ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <RefreshCw className="size-4" />
                            )}
                            重新检查
                        </Button>
                    )}
                </div>
            </SettingRow>
            {detail}
            {updateInfo?.error && !disabledCheck && (
                <p role="alert" className="px-5 py-3 text-xs text-destructive">
                    {updateInfo.error}
                </p>
            )}
            <UpdateSources />
            <UpdateInstaller version={updateInfo?.hasUpdate ? updateInfo.latest : null} />
        </Group>
    );
}

export function AboutPanel() {
    return (
        <div className="flex flex-col gap-5">
            {/* brand hero */}
            <Card className="overflow-hidden">
                <CardContent className="flex flex-col items-center gap-3 px-6 py-9 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                        className="flex flex-col items-center gap-3"
                    >
                        <div className="relative">
                            <div
                                aria-hidden
                                className="absolute inset-0 -z-10 scale-125 rounded-full bg-primary/20 blur-2xl"
                            />
                            <img
                                src={BRAND_LOGO_URL}
                                alt=""
                                className="size-20 rounded-2xl object-cover drop-shadow-sm"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-semibold tracking-tight">Nowluma</span>
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-meta text-primary tabular-nums">
                                v{APP_VERSION}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Next Remote Protocol Framework · 下一代远程协议框架
                        </p>
                    </motion.div>
                    <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
                        以轻量注入驱动 QQ NT，对外提供标准 OneBot v11
                        接口，让机器人一次部署、长期稳定运行。
                    </p>
                </CardContent>
            </Card>

            {/* software update */}
            <UpdateGroup />

            {/* support + links */}
            <Card className="overflow-hidden">
                <CardContent className="flex flex-col items-center gap-4 px-6 py-7 text-center">
                    <Star className="size-7 fill-primary/15 text-primary" />
                    <div className="flex flex-col items-center gap-1">
                        <p className="text-sm font-medium">喜欢 Nowluma？给个 Star 支持一下</p>
                        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                            开源不易，你的 ⭐ 是我们持续维护的最大动力。
                        </p>
                    </div>
                    <Button asChild className="w-full max-w-xs">
                        <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                            <Github className="size-4" /> 去 GitHub 点 Star
                        </a>
                    </Button>
                    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1 text-[12px]">
                        <AboutLink href={REPO_URL} icon={Github}>
                            仓库
                        </AboutLink>
                        <AboutLink href={`${REPO_URL}/releases`} icon={Tag}>
                            发行版
                        </AboutLink>
                        <AboutLink href={`${REPO_URL}/issues`} icon={Bug}>
                            反馈问题
                        </AboutLink>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function AboutLink({
    href,
    icon: Icon,
    children,
}: {
    href: string;
    icon: typeof Sun;
    children: ReactNode;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
            <Icon className="size-3.5" />
            {children}
            <ExternalLink className="size-3 opacity-50" />
        </a>
    );
}
