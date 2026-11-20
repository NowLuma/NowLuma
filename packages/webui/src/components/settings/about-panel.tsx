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

    const disabledCheck = !resources.updateInfo.error && updateInfo?.error === 'disabled';
    const updateError = resources.updateInfo.error || (!disabledCheck ? updateInfo?.error : null);

    let status: ReactNode;

    if (updateError) {
        status = <span className="text-muted-foreground">无法检查</span>;
    } else if (disabledCheck) {
        status = <span className="text-muted-foreground">检查已关闭</span>;
    } else if (!updateInfo) {
        status = null;
    } else if (updateInfo.hasUpdate && updateInfo.latest) {
        status = <span className="font-medium">发现新版本</span>;
    } else {
        status = (
            <span className="inline-flex items-center gap-1.5 text-success">
                <Check className="size-3.5" /> 已是最新
            </span>
        );
    }

    // Rich detail block, only when an update is available (narrows `latest`).
    let detail: ReactNode = null;

    if (!updateError && !disabledCheck && updateInfo?.hasUpdate && updateInfo.latest) {
        const latest = updateInfo.latest;
        detail = (
            <div className="flex min-w-0 flex-col gap-3 py-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">v{latest}</span>
                    {updateInfo.publishedAt && (
                        <span className="ml-auto text-meta tabular-nums text-muted-foreground">
                            {new Date(updateInfo.publishedAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    当前 v{updateInfo.current} → 最新 v{latest}
                </p>
                {updateInfo.notes && (
                    <details className="text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            版本变更
                        </summary>
                        <pre className="max-w-prose whitespace-pre-wrap break-words border-l pl-4 font-mono text-xs leading-relaxed">
                            {updateInfo.notes}
                        </pre>
                    </details>
                )}
                {updateInfo.htmlUrl && (
                    <Button asChild variant="glass" size="sm" className="self-start">
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
            <SettingRow label="检查更新">
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
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
                        <Button variant="glass" size="sm" onClick={onCheck} disabled={checking}>
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
            {updateError && (
                <p role="alert" className="py-3 text-xs text-destructive">{updateError}</p>
            )}
            <UpdateSources />
            <UpdateInstaller version={!updateError && !disabledCheck && updateInfo?.hasUpdate ? updateInfo.latest : null} />
        </Group>
    );
}

export function AboutPanel() {
    return (
        <div className="flex min-w-0 flex-col gap-7">
            <header aria-label="Nowluma" className="flex flex-wrap items-center gap-3 border-b pb-5">
                <img src={BRAND_LOGO_URL} alt="" className="size-9 shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-xl font-semibold tracking-tight">Nowluma</h2>
                    <p className="mt-1 text-xs text-muted-foreground">QQ NT · OneBot v11</p>
                </div>
                <code className="font-mono text-xs text-muted-foreground tabular-nums">v{APP_VERSION}</code>
            </header>

            <UpdateGroup />

            <Group title="项目与许可" icon={Scale} description="© 2026 Nowluma contributors">
                <SettingRow label="源代码">
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
                <SettingRow label="GPLv3" hint="允许使用、修改和分发（含商业用途），无担保；第三方与原生组件遵循各自许可。">
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
        <Button asChild variant="glass" size="sm" className="max-w-full whitespace-normal">
            <a href={href} target="_blank" rel="noreferrer noopener">
                <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="min-w-0 break-all">{children}</span>
                <ExternalLink aria-hidden="true" className="size-3 shrink-0 opacity-50" />
            </a>
        </Button>
    );
}
