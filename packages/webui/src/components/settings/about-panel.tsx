import { useState, type ReactNode } from 'react';
import {
    Bug,
    Check,
    ExternalLink,
    Github,
    Loader2,
    Mail,
    RefreshCw,
    Sparkles,
    Scale,
    Tag,
    type Sun,
} from 'lucide-react';
import { BRAND_LOGO_URL } from '@/brand';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { UpdateInstaller } from '@/components/settings/update-installer';
import { UpdateSources } from '@/components/settings/update-sources';
import { Button } from '@/components/ui/button';
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
        <div className="flex min-w-0 flex-col gap-5">
            <section
                aria-label="Nowluma"
                className="cp-panel flex flex-wrap items-center gap-4 p-5 sm:p-6"
            >
                <img src={BRAND_LOGO_URL} alt="" className="size-12 shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold tracking-tight">Nowluma</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        连接 QQ NT，提供标准 OneBot v11 接口。
                    </p>
                </div>
                <code className="font-mono text-sm text-muted-foreground tabular-nums">
                    v{APP_VERSION}
                </code>
            </section>

            <UpdateGroup />

            <Group title="项目与许可" icon={Scale} description="© 2026 Nowluma contributors">
                <SettingRow label="源代码" hint="版本、发布说明与问题反馈。" layout="stack">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                        <AboutLink href={REPO_URL} icon={Github}>
                            GitHub
                        </AboutLink>
                        <AboutLink href={`${REPO_URL}/releases`} icon={Tag}>
                            发行版
                        </AboutLink>
                        <AboutLink href={`${REPO_URL}/issues`} icon={Bug}>
                            反馈问题
                        </AboutLink>
                    </div>
                </SettingRow>
                <SettingRow label="GPLv3" hint="允许商业使用；第三方组件与原生组件遵循各自的许可。">
                    <AboutLink href="https://www.gnu.org/licenses/gpl-3.0.html" icon={Scale}>
                        查看许可
                    </AboutLink>
                </SettingRow>
                <SettingRow label="侵权投诉">
                    <AboutLink href="mailto:ws675170761@gmail.com" icon={Mail}>
                        ws675170761@gmail.com
                    </AboutLink>
                </SettingRow>
            </Group>
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
            className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
            <Icon className="size-3.5" />
            {children}
            <ExternalLink className="size-3 opacity-50" />
        </a>
    );
}
