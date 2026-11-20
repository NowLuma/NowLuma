import { useEffect, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    Clock3,
    Database,
    FileClock,
    HardDrive,
    Image,
    Loader2,
    Lock,
    MessageSquare,
    RefreshCw,
    Save,
    SmilePlus,
    Trash2,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useFlashMessage } from '@/hooks/use-flash-message';
import { useApi } from '@/lib/api';
import {
    buildLogSettingsPatch,
    formatBytes,
    isAllAccountsConfirmation,
    logStoragePresentation,
    type StorageTone,
} from '@/lib/storage-presentation';
import { cn } from '@/lib/utils';
import {
    ALL_ACCOUNTS_CONFIRMATION,
    type AccountStorageCategory,
    type AccountStorageSnapshot,
    type LastStorageCleanup,
    type LogStorageSettings,
    type LogStorageSettingsField,
    type StorageCleanupRequest,
    type StorageCleanupResponse,
    type StorageOverviewResponse,
} from '@/types';

const CATEGORY_INFO: Record<
    AccountStorageCategory,
    { label: string; description: string; icon: LucideIcon; bytes: keyof AccountStorageSnapshot }
> = {
    messages: {
        label: '消息历史',
        description: 'OneBot 消息与回复索引',
        icon: MessageSquare,
        bytes: 'messagesBytes',
    },
    media: {
        label: '媒体索引',
        description: '图片、语音与视频的元数据',
        icon: Image,
        bytes: 'mediaBytes',
    },
    reactions: {
        label: '表情回应',
        description: '群消息表情回应记录',
        icon: SmilePlus,
        bytes: 'reactionsBytes',
    },
};

const CATEGORIES = Object.keys(CATEGORY_INFO) as AccountStorageCategory[];

interface PendingCleanup {
    request: Exclude<StorageCleanupRequest, { scope: 'allAccounts' }>;
    title: string;
    description: string;
}

export function StoragePanel() {
    const api = useApi();
    const { runAction } = useActionFeedback();
    const [data, setData] = useState<StorageOverviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [operation, setOperation] = useState<string | null>(null);
    const [maxTotalMb, setMaxTotalMb] = useState('');
    const [retainDays, setRetainDays] = useState('');
    const [perUin, setPerUin] = useState(false);
    const [pendingCleanup, setPendingCleanup] = useState<PendingCleanup | null>(null);
    const [allAccountsCategory, setAllAccountsCategory] = useState<AccountStorageCategory | null>(
        null,
    );
    const { msg, flash, setMsg } = useFlashMessage(5000);

    const applyOverview = (overview: StorageOverviewResponse) => {
        setData(overview);
        setMaxTotalMb(String(overview.settings.effective.logMaxTotalMb));
        setRetainDays(String(overview.settings.effective.logRetainDays));
        setPerUin(overview.settings.effective.logPerUin);
    };

    const load = async (showSpinner = false): Promise<boolean> => {
        if (showSpinner) {
            if (data === null) {
                setLoading(true);
            } else {
                setRefreshing(true);
            }
        }

        try {
            const overview = await api.storage.get();
            applyOverview(overview);
            return true;
        } catch (error) {
            console.error('load storage overview failed', error);
            setMsg({
                kind: 'err',
                text: error instanceof Error ? error.message : '加载存储信息失败',
            });
            return false;
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        void load();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const isLocked = (field: LogStorageSettingsField): boolean =>
        data?.settings.envOverrides.includes(field) ?? false;

    const saveSettings = async () => {
        if (!data || saving || refreshing || operation !== null) {
            return;
        }

        const nextMaxTotalMb = Number(maxTotalMb);
        const nextRetainDays = Number(retainDays);

        if (!Number.isSafeInteger(nextMaxTotalMb) || nextMaxTotalMb < 1) {
            flash('err', '日志总量上限必须是大于 0 的整数');
            return;
        }

        if (!Number.isSafeInteger(nextRetainDays) || nextRetainDays < 0) {
            flash('err', '保留天数必须是大于或等于 0 的整数');
            return;
        }

        const current: LogStorageSettings = {
            logMaxTotalMb: nextMaxTotalMb,
            logRetainDays: nextRetainDays,
            logPerUin: perUin,
        };
        const patch = buildLogSettingsPatch(
            current,
            data.settings.saved,
            data.settings.envOverrides,
        );

        if (Object.keys(patch).length === 0) {
            return;
        }

        setSaving(true);

        try {
            const result = await runAction(
                {
                    title: '正在更新日志策略',
                    detail: '正在保存并应用存储限制',
                    successTitle: '日志策略已更新',
                    successDetail: '新策略已立即生效',
                    errorTitle: '日志策略更新失败',
                },
                () => api.storage.saveSettings(patch),
            );
            applyOverview({
                settings: result.settings,
                snapshot: result.snapshot,
                lastCleanup: data.lastCleanup,
            });
            flash('ok', '日志策略已保存并立即生效');
        } catch (error) {
            const message = error instanceof Error ? error.message : '保存失败';
            const refreshed = await load();
            setMsg({
                kind: 'err',
                text: refreshed ? message : `${message}；存储状态刷新失败，请手动刷新页面`,
            });
        } finally {
            setSaving(false);
        }
    };

    const runCleanup = async (request: StorageCleanupRequest): Promise<StorageCleanupResponse> => {
        if (saving || refreshing || operation !== null) {
            throw new Error('已有存储操作正在进行');
        }

        const key = cleanupKey(request);
        setOperation(key);

        try {
            const result = await runAction(
                {
                    title: '正在清理存储数据',
                    detail: cleanupLabel(request),
                    successTitle: '存储数据清理完成',
                    successDetail: cleanupResultSummary,
                    errorTitle: '存储数据清理失败',
                    resultError: (outcome) =>
                        outcome.success ? null : cleanupResultSummary(outcome),
                },
                () => api.storage.cleanup(request),
            );

            if (result.snapshot) {
                setData((previous) =>
                    previous
                        ? {
                              ...previous,
                              snapshot: result.snapshot!,
                              lastCleanup: result.lastCleanup ?? previous.lastCleanup,
                          }
                        : previous,
                );
            } else {
                const refreshed = await load();
                if (!refreshed) {
                    setMsg({
                        kind: 'err',
                        text: `${cleanupResultSummary(result)}；存储状态刷新失败，请手动刷新页面`,
                    });
                    return result;
                }
            }

            if (result.success) {
                flash('ok', cleanupResultSummary(result));
            } else {
                setMsg({ kind: 'err', text: cleanupResultSummary(result) });
            }
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : '清理失败';
            const refreshed = await load();
            setMsg({
                kind: 'err',
                text: refreshed ? message : `${message}；存储状态刷新失败，请手动刷新页面`,
            });
            throw error;
        } finally {
            setOperation(null);
        }
    };

    if (loading || !data) {
        return (
            <SkeletonSwap
                ready={!loading}
                lines={7}
                lineHeight={26}
                reserve={182}
                label="存储信息"
                className={!loading ? 'skeleton-swap-fluid min-h-[182px]' : ''}
            >
                {!loading && !data ? (
                    <div role="alert" className="flex flex-wrap items-center gap-3 border-b py-5">
                        <p className="text-sm text-destructive">{msg?.text ?? '存储信息暂时不可用。'}</p>
                        <Button variant="glass" onClick={() => void load(true)}>
                            <RefreshCw className="size-4" />
                            重试
                        </Button>
                    </div>
                ) : null}
            </SkeletonSwap>
        );
    }

    const { snapshot } = data;
    const logPresentation = logStoragePresentation(snapshot.logs);
    const onlineCount = snapshot.accounts.filter((account) => account.online).length;
    const allCategoryBytes = Object.fromEntries(
        CATEGORIES.map((category) => [
            category,
            snapshot.accounts.reduce(
                (sum, account) => sum + Number(account[CATEGORY_INFO[category].bytes]),
                0,
            ),
        ]),
    ) as Record<AccountStorageCategory, number>;

    return (
        <SkeletonSwap
            ready
            lines={7}
            lineHeight={26}
            reserve={182}
            label="存储信息"
            className="skeleton-swap-fluid min-h-[182px]"
        >
            <div className="flex min-w-0 flex-col gap-7">
                {msg && (
                    <div
                        role={msg.kind === 'ok' ? 'status' : 'alert'}
                        className={cn(
                            'text-xs',
                            msg.kind === 'ok' ? 'text-success' : 'text-destructive',
                        )}
                    >
                        {msg.text}
                    </div>
                )}

                <Group
                    title="空间用量"
                    icon={HardDrive}
                    description="日志、账号数据库与传输临时数据。"
                >
                    <div className="flex min-w-0 flex-col gap-4 py-3">
                        <div className="flex justify-end">
                            <Button
                                variant="glass"
                                size="sm"
                                onClick={() => void load(true)}
                                disabled={refreshing || saving || operation !== null}
                                className="shrink-0"
                            >
                                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                                刷新
                            </Button>
                        </div>

                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                            <Metric
                                label="受管数据总量"
                                value={formatBytes(snapshot.totals.managedBytes)}
                            />
                            <Metric label="日志" value={formatBytes(snapshot.totals.logsBytes)} />
                            <Metric
                                label="账号数据库"
                                value={formatBytes(snapshot.totals.accountDataBytes)}
                            />
                            <Metric
                                label="传输临时数据"
                                value={formatBytes(snapshot.totals.temporaryBytes)}
                            />
                        </dl>

                        <div className="border-t pt-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-medium">日志容量</p>
                                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                                        {formatBytes(snapshot.logs.totalBytes)} /{' '}
                                        {formatBytes(snapshot.logs.maxTotalBytes)}
                                    </p>
                                </div>
                                <Badge variant={toneBadgeVariant(logPresentation.tone)}>
                                    {logPresentation.label}
                                </Badge>
                            </div>
                            <Progress
                                value={logPresentation.percent}
                                aria-label="日志容量使用率"
                                indicatorClassName={toneProgressClass(logPresentation.tone)}
                            />
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{snapshot.logs.fileCount} 个文件</span>
                                <span>{snapshot.logs.activeFileCount} 个活动文件</span>
                                <span>丢弃 {snapshot.logs.droppedLines} 行磁盘日志</span>
                            </div>
                            {snapshot.logs.lastError && (
                                <div role="alert" className="mt-3 flex items-start gap-2 text-xs text-destructive">
                                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                    <span className="break-words">{snapshot.logs.lastError}</span>
                                </div>
                            )}
                        </div>

                        {data.lastCleanup && <LastCleanupSummary cleanup={data.lastCleanup} />}
                    </div>
                </Group>

                <Group title="日志保留" icon={FileClock} description="保存后立即应用，总量上限始终生效。">
                    <SettingRow label="日志总量上限（MB）" hint={<EnvironmentBadge locked={isLocked('logMaxTotalMb')} />}>
                        <Input
                            id="storage-log-max"
                            aria-label="日志总量上限（MB）"
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            value={maxTotalMb}
                            onChange={(event) => setMaxTotalMb(event.target.value)}
                            disabled={isLocked('logMaxTotalMb') || saving || refreshing || operation !== null}
                            className="max-w-xs tabular-nums"
                        />
                    </SettingRow>
                    <SettingRow label="保留天数" hint={<><EnvironmentBadge locked={isLocked('logRetainDays')} /> 0 表示只按总量淘汰。</>}>
                        <Input
                            id="storage-log-days"
                            aria-label="保留天数"
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={retainDays}
                            onChange={(event) => setRetainDays(event.target.value)}
                            disabled={isLocked('logRetainDays') || saving || refreshing || operation !== null}
                            className="max-w-xs tabular-nums"
                        />
                    </SettingRow>
                    <SettingRow
                        label="按账号额外写入日志"
                        hint={<><EnvironmentBadge locked={isLocked('logPerUin')} /> 在账号子目录多写一份，会增加占用。</>}
                        layout="inline"
                    >
                        <ToggleSwitch
                            value={perUin}
                            onChange={setPerUin}
                            ariaLabel="按账号额外写入日志"
                            disabled={isLocked('logPerUin') || saving || refreshing || operation !== null}
                        />
                    </SettingRow>
                    <div className="py-3">
                        <Button
                            variant="glass"
                            onClick={() => void saveSettings()}
                            disabled={saving || refreshing || operation !== null || data.settings.envOverrides.length === 3}
                        >
                            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                            保存并应用
                        </Button>
                    </div>
                </Group>

                <Group
                    title="清理临时数据"
                    icon={Trash2}
                    description="日志会先轮转；上传和下载中的临时数据会保留。"
                >
                    <div className="divide-y divide-border/60">
                        <CleanupRow
                            icon={FileClock}
                            title="日志"
                            description={`${snapshot.logs.fileCount} 个文件 · ${formatBytes(snapshot.logs.totalBytes)}`}
                            busy={operation === 'logs'}
                            disabled={saving || refreshing || operation !== null}
                            onClick={() =>
                                setPendingCleanup({
                                    request: { scope: 'logs' },
                                    title: '清理全部日志？',
                                    description:
                                        'Nowluma 会先轮转活动日志，再删除旧日志，只保留新建的空文件。',
                                })
                            }
                        />
                        <CleanupRow
                            icon={Activity}
                            title="文件传输临时数据"
                            description={`${snapshot.temporary.fileCount} 个文件 · ${formatBytes(snapshot.temporary.totalBytes)} · ${snapshot.temporary.activeItemCount} 个活动传输`}
                            busy={operation === 'temporary'}
                            disabled={saving || refreshing || operation !== null}
                            onClick={() =>
                                setPendingCleanup({
                                    request: { scope: 'temporary' },
                                    title: '清理非活动临时数据？',
                                    description:
                                        '正在上传或下载的项目会保留，其余 Nowluma 文件传输临时数据将被删除。',
                                })
                            }
                        />
                    </div>
                </Group>

                <Group title="账号数据库" icon={Database} description="账号离线后可按分类清理，不含配置与凭据。">
                    <div className="min-w-0 divide-y divide-border/60">
                        {snapshot.accounts.length === 0 ? (
                            <p className="py-5 text-sm text-muted-foreground">尚未发现账号数据库。</p>
                        ) : (
                            snapshot.accounts.map((account) => (
                                <AccountStorageSection
                                    key={account.uin}
                                    account={account}
                                    operation={operation}
                                    saving={saving || refreshing}
                                    onRequest={(category) => {
                                        const info = CATEGORY_INFO[category];
                                        setPendingCleanup({
                                            request: {
                                                scope: 'account',
                                                category,
                                                uin: account.uin,
                                            },
                                            title: `清理 ${account.nickname || account.uin} 的${info.label}？`,
                                            description: `将删除账号 ${account.uin} 的${info.label}数据库及其边车文件，其他分类和配置不受影响。`,
                                        });
                                    }}
                                />
                            ))
                        )}
                    </div>
                </Group>

                {snapshot.accounts.length > 0 && (
                    <Group
                        title="全部账号"
                        icon={Users}
                        description={onlineCount > 0
                            ? `${onlineCount} 个账号仍在线，批量清理暂不可用。`
                            : '按分类清理全部账号，操作前需输入确认短语。'}
                    >
                        {CATEGORIES.map((category) => (
                            <SettingRow
                                key={category}
                                label={CATEGORY_INFO[category].label}
                                hint={`总计 ${formatBytes(allCategoryBytes[category])}`}
                            >
                                <Button
                                    variant="ghost"
                                    onClick={() => setAllAccountsCategory(category)}
                                    disabled={operation !== null || saving || refreshing || onlineCount > 0 || allCategoryBytes[category] === 0}
                                    aria-label={`清理全部${CATEGORY_INFO[category].label}`}
                                    className="text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="size-4" /> 清理全部
                                </Button>
                            </SettingRow>
                        ))}
                    </Group>
                )}

                <ConfirmDialog
                    open={pendingCleanup !== null}
                    onOpenChange={(open) => {
                        if (!open && operation === null) {
                            setPendingCleanup(null);
                        }
                    }}
                    title={pendingCleanup?.title ?? ''}
                    description={pendingCleanup?.description}
                    confirmText="确认清理"
                    destructive
                    onConfirm={async () => {
                        if (!pendingCleanup) {
                            return;
                        }

                        const result = await runCleanup(pendingCleanup.request);
                        if (!result.success) {
                            throw new Error(cleanupResultSummary(result));
                        }
                        setPendingCleanup(null);
                    }}
                />

                <AllAccountsCleanupDialog
                    category={allAccountsCategory}
                    busy={operation?.startsWith('allAccounts:') ?? false}
                    onOpenChange={(open) => {
                        if (!open && operation === null) {
                            setAllAccountsCategory(null);
                        }
                    }}
                    onConfirm={async (category) => {
                        const result = await runCleanup({
                            scope: 'allAccounts',
                            category,
                            confirmation: ALL_ACCOUNTS_CONFIRMATION,
                        });
                        if (!result.success) {
                            throw new Error(cleanupResultSummary(result));
                        }
                        setAllAccountsCategory(null);
                    }}
                />
            </div>
        </SkeletonSwap>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-base font-semibold tabular-nums">{value}</dd>
        </div>
    );
}

function EnvironmentBadge({ locked }: { locked: boolean }) {
    if (!locked) {
        return null;
    }

    return (
        <Badge variant="secondary" className="gap-1 text-micro">
            <Lock className="size-3" />
            环境变量锁定
        </Badge>
    );
}

function CleanupRow({
    icon: Icon,
    title,
    description,
    busy,
    disabled,
    onClick,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
    busy: boolean;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <div className="grid min-w-0 gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="flex min-w-0 items-start gap-2">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {description}
                    </p>
                </div>
            </div>
            <Button
                variant="glass"
                onClick={onClick}
                disabled={disabled}
                className="justify-self-start text-destructive hover:text-destructive"
            >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                清理
            </Button>
        </div>
    );
}

function AccountStorageSection({
    account,
    operation,
    saving,
    onRequest,
}: {
    account: AccountStorageSnapshot;
    operation: string | null;
    saving: boolean;
    onRequest: (category: AccountStorageCategory) => void;
}) {
    return (
        <section aria-label={`账号 ${account.uin}`} className="min-w-0 py-4">
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="break-words text-sm font-medium">{account.nickname || `账号 ${account.uin}`}</h3>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">{account.uin}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(account.totalBytes)}</span>
                    <Badge variant={account.online ? 'warning' : 'secondary'}>{account.online ? '在线' : '离线'}</Badge>
                </div>
            </header>
            {account.online && <p className="mb-2 text-xs text-muted-foreground">此账号离线后可清理。</p>}
            <div className="divide-y divide-border/60">
                {CATEGORIES.map((category) => {
                    const info = CATEGORY_INFO[category];
                    const Icon = info.icon;
                    const bytes = Number(account[info.bytes]);
                    const key = `account:${account.uin}:${category}`;
                    return (
                        <div key={category} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                            <div className="flex min-w-0 items-start gap-2">
                                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">{info.label}</p>
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{info.description}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(bytes)}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onRequest(category)}
                                    disabled={saving || operation !== null || account.online || bytes === 0}
                                    aria-label={`清理 ${account.uin} 的${info.label}`}
                                    className="text-destructive hover:text-destructive"
                                >
                                    {operation === key ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                                    清理
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function LastCleanupSummary({ cleanup }: { cleanup: LastStorageCleanup }) {
    const label = cleanup.category
        ? CATEGORY_INFO[cleanup.category].label
        : cleanup.scope === 'logs'
          ? '日志'
          : '传输临时数据';
    return (
        <div className="flex items-start gap-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
            <Clock3 className="mt-0.5 size-3.5 shrink-0" />
            <div className="min-w-0">
                <p>
                    最近清理：{cleanup.accountScope === 'all' ? '全部账号 · ' : cleanup.uin ? `账号 ${cleanup.uin} · ` : ''}
                    {label}，删除 {cleanup.deletedFiles} 个文件，释放{' '}
                    {formatBytes(cleanup.freedBytes)}
                    {cleanup.failureCount > 0 ? `，${cleanup.failureCount} 项失败` : ''}
                    {' · '}
                    {formatTimestamp(cleanup.at)}
                </p>
                {cleanup.failures.length > 0 && (
                    <details className="mt-1">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            查看 {cleanup.failures.length} 项清理失败
                        </summary>
                        <ul role="alert" className="list-disc space-y-1 pl-4 text-destructive">
                            {cleanup.failures.map((failure, index) => (
                                <li key={`${failure.item}:${String(index)}`} className="break-words">
                                    {failure.uin && <>账号 {failure.uin} · </>}
                                    {failure.item || failure.file}：{failure.message}
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
            </div>
        </div>
    );
}

function AllAccountsCleanupDialog({
    category,
    busy,
    onOpenChange,
    onConfirm,
}: {
    category: AccountStorageCategory | null;
    busy: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (category: AccountStorageCategory) => Promise<void>;
}) {
    const [confirmation, setConfirmation] = useState('');
    const open = category !== null;

    const close = () => {
        setConfirmation('');
        onOpenChange(false);
    };

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen && !busy) {
                    close();
                }
            }}
            title={`清理全部账号的${category ? CATEGORY_INFO[category].label : '数据'}？`}
            description={
                <>
                    该操作会删除所有离线账号的对应数据库及边车文件，无法撤销。请输入
                    <strong className="mx-1 text-foreground">{ALL_ACCOUNTS_CONFIRMATION}</strong>
                    继续。
                </>
            }
            content={
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="all-account-cleanup-confirmation">确认短语</Label>
                    <Input
                        id="all-account-cleanup-confirmation"
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        placeholder={ALL_ACCOUNTS_CONFIRMATION}
                        autoComplete="off"
                        disabled={busy}
                    />
                </div>
            }
            confirmText="确认清理"
            destructive
            confirmDisabled={!isAllAccountsConfirmation(confirmation) || busy || !category}
            onConfirm={async () => {
                if (!category || !isAllAccountsConfirmation(confirmation)) {
                    return;
                }

                await onConfirm(category);
                setConfirmation('');
            }}
        />
    );
}

function cleanupKey(request: StorageCleanupRequest): string {
    if (request.scope === 'account') {
        return `account:${request.uin}:${request.category}`;
    }

    if (request.scope === 'allAccounts') {
        return `allAccounts:${request.category}`;
    }

    return request.scope;
}

function cleanupLabel(request: StorageCleanupRequest): string {
    if (request.scope === 'logs') {
        return '全部日志';
    }

    if (request.scope === 'temporary') {
        return '非活动文件传输临时数据';
    }

    const label = CATEGORY_INFO[request.category].label;
    return request.scope === 'allAccounts'
        ? `全部账号的${label}`
        : `账号 ${request.uin} 的${label}`;
}

function cleanupResultSummary(result: StorageCleanupResponse): string {
    const summary = [
        `删除 ${result.cleanup.deletedFiles} 个文件`,
        `释放 ${formatBytes(result.cleanup.freedBytes)}`,
    ];

    if ('skippedActiveItems' in result.cleanup && result.cleanup.skippedActiveItems > 0) {
        summary.push(`跳过 ${result.cleanup.skippedActiveItems} 个活动传输`);
    }

    if (result.cleanup.failures.length > 0) {
        summary.push(`${result.cleanup.failures.length} 项失败`);
    }

    if (!result.success && result.message) {
        summary.push(result.message);
    }

    return summary.join('，');
}

function toneBadgeVariant(tone: StorageTone): BadgeProps['variant'] {
    if (tone === 'success') {
        return 'success';
    }

    if (tone === 'warning') {
        return 'warning';
    }

    if (tone === 'danger') {
        return 'destructive';
    }

    return 'secondary';
}

function toneProgressClass(tone: StorageTone): string {
    if (tone === 'danger') {
        return 'bg-destructive';
    }

    if (tone === 'warning') {
        return 'bg-warning';
    }

    if (tone === 'neutral') {
        return 'bg-muted-foreground';
    }

    return 'bg-success';
}

function formatTimestamp(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
