// OneBot per-UIN configuration page.
//
// Layout: compact account context + local category navigation + a document
// editor. Network adapters are aligned rows; create and edit share
// `NodeEditDialog`. Account changes keep the unsaved-edit gate.
// auto-save: network mutations persist immediately; general-settings edits
// are debounced (500 ms). The editor surface reports unsaved state, save
// results and load errors in place.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { Check, Loader2, MousePointerClick, Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollableTabList } from '@/components/ui/tabs';
import { GlassSurface } from '@/components/ui/glass-material';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { cn, copyText } from '@/lib/utils';
import { connectionEndpoint } from '@/lib/connection-endpoint';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import type { AdapterStatus, NetworkKind, OneBotConfig, OneBotNetworks } from '@/types';
import { useOneBotInstanceConfig } from '@/hooks/use-onebot-instance-config';
import { useAppState } from '@/contexts/AppStateContext';
import { useLayout } from '@/contexts/LayoutContext';
import { AccountContextStrip } from '@/components/config/account-context-strip';
import { GeneralSettingsTab } from '@/components/config/general-settings-tab';
import { AdapterRow } from '@/components/config/adapter-row';
import { NodeEditDialog } from '@/components/config/node-edit-dialog';
import {
    ALL_TABS,
    NETWORK_TABS,
    nextUniqueSuffix,
    type TabKey,
} from '@/components/config/defaults';
import '@/styles/console-pages.css';

type DialogState =
    | { open: false }
    | {
          open: true;
          kind: NetworkKind;
          index: number | null;
          seed: OneBotNetworks[NetworkKind][number];
      };
//   index: null → create with `seed`, otherwise edit the item at that position.

export function ConfigPage() {
    const { qqList, connections, selectedUin, setSelectedUin, resources, refreshQqList } =
        useAppState();
    const {
        config,
        loading,
        loadError,
        reload,
        setConfig,
        dirty,
        requestSwitchUin,
        pendingSwitchUin,
        confirmSwitch,
        cancelSwitch,
        save,
        saveStatus,
        saveStatusTone,
    } = useOneBotInstanceConfig(qqList, {
        selectedUin,
        onSelectedUinChange: setSelectedUin,
    });
    const { pages, setPages } = useLayout();
    const [activeTab, setActiveTabState] = useState<TabKey>(() => {
        const t = pages.configTab;
        return t === 'general' || (!!t && t in NETWORK_TABS) ? (t as TabKey) : 'general';
    });
    // Persist the last-used tab as the default for next time.
    const setActiveTab = useCallback(
        (t: TabKey) => {
            setActiveTabState(t);
            setPages({ configTab: t });
        },
        [setPages],
    );
    // The edit dialog is modal and blocks every other click in the page,
    // so `selectedUin` cannot change while it's open — no defensive close
    // wiring needed beyond the dialog's own open/close.
    const [dialog, setDialog] = useState<DialogState>({ open: false });

    const pendingSwitchAccount = useMemo(
        () => (pendingSwitchUin ? (qqList.find((q) => q.uin === pendingSwitchUin) ?? null) : null),
        [pendingSwitchUin, qqList],
    );

    // Live adapter status for the selected account, keyed by adapter name so
    // each summary row can light up its real connection state.
    const liveStatusByName = useMemo(() => {
        const acc = connections.find((c) => c.uin === selectedUin);
        const map = new Map<string, AdapterStatus>();

        for (const a of acc?.adapters ?? []) {
            map.set(a.name, a);
        }

        return map;
    }, [connections, selectedUin]);

    const debounceRef = useRef<number | null>(null);
    const cancelPendingSave = useCallback(() => {
        if (debounceRef.current != null) {
            window.clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
    }, []);
    useEffect(() => cancelPendingSave, [selectedUin, cancelPendingSave]);

    // Full-config callbacks must still belong to the displayed, editable snapshot.
    const editContext = { config, selectedUin, saving: saveStatusTone === 'saving' };
    const editContextRef = useRef<typeof editContext | null>(null);
    useLayoutEffect(() => {
        editContextRef.current = editContext;

        return () => {
            editContextRef.current = null;
        };
    });
    const canEditConfig = () => editContextRef.current === editContext && !editContext.saving;

    // Only a new general-setting edit schedules a write; failed saves never retry themselves.
    const updateGeneralSettings = (next: OneBotConfig) => {
        if (!canEditConfig()) {
            return;
        }

        editContextRef.current = null;
        setConfig(next);
        cancelPendingSave();
        debounceRef.current = window.setTimeout(() => {
            debounceRef.current = null;
            editContextRef.current = null;
            void save(next).catch(() => undefined);
        }, 500);
    };

    const immediateSave = () => {
        if (!canEditConfig()) {
            return;
        }

        editContextRef.current = null;
        cancelPendingSave();
        void save().catch(() => undefined);
    };

    async function commitKind<K extends NetworkKind>(
        kind: K,
        nextList: OneBotNetworks[K],
    ): Promise<void> {
        if (!config) {
            throw new Error('账号配置尚未加载');
        }

        if (!canEditConfig()) {
            throw new Error('配置正在保存或已更新，请重新确认修改');
        }

        editContextRef.current = null;
        cancelPendingSave();
        const next = { ...config, networks: { ...config.networks, [kind]: nextList } };
        await save(next);
    }

    async function handleCreate<K extends NetworkKind>(
        kind: K,
        item: OneBotNetworks[K][number],
    ): Promise<void> {
        if (!config) {
            return;
        }

        const list = config.networks[kind] as OneBotNetworks[K];
        await commitKind(kind, [...list, item] as OneBotNetworks[K]);
    }

    async function handleEdit<K extends NetworkKind>(
        kind: K,
        index: number,
        item: OneBotNetworks[K][number],
    ): Promise<void> {
        if (!config) {
            return;
        }

        const list = config.networks[kind] as OneBotNetworks[K];
        await commitKind(kind, list.map((it, i) => (i === index ? item : it)) as OneBotNetworks[K]);
    }

    async function handleDelete<K extends NetworkKind>(kind: K, index: number): Promise<void> {
        if (!config) {
            return;
        }

        const list = config.networks[kind] as OneBotNetworks[K];
        await commitKind(kind, list.filter((_, i) => i !== index) as OneBotNetworks[K]);
    }

    async function handleToggleEnabled<K extends NetworkKind>(
        kind: K,
        index: number,
        enabled: boolean,
    ): Promise<void> {
        if (!config) {
            return;
        }

        const list = config.networks[kind] as OneBotNetworks[K];
        await commitKind(
            kind,
            list.map((it, i) =>
                i === index
                    ? ({ ...it, enabled: enabled ? undefined : false } as OneBotNetworks[K][number])
                    : it,
            ) as OneBotNetworks[K],
        );
    }

    const openCreate = (kind: NetworkKind) => {
        if (!config || !canEditConfig()) {
            return;
        }

        const tab = NETWORK_TABS[kind];
        const list = config.networks[kind];
        const suffix = nextUniqueSuffix(list, tab.defaultEntry);
        setDialog({ open: true, kind, index: null, seed: tab.defaultEntry(suffix) });
    };

    const openEdit = (kind: NetworkKind, index: number) => {
        if (!config || !canEditConfig()) {
            return;
        }

        const item = config.networks[kind][index];

        if (!item) {
            return;
        }

        setDialog({ open: true, kind, index, seed: item });
    };

    return (
        <div className="cp-page">
            <header className="cp-document-header">
                <div className="min-w-0">
                    <h2 className="cp-page-heading">账号连接</h2>
                    <p className="cp-lede">按 QQ 账号配置连接与消息行为，改动自动保存。</p>
                </div>
                {resources.qqList.error && qqList.length > 0 && (
                    <div
                        role="alert"
                        className="cp-inline-notice text-destructive"
                    >
                        {resources.qqList.error}；当前显示上次成功读取的账号列表。
                    </div>
                )}
                {qqList.length > 0 && (
                    <AccountContextStrip
                        accounts={qqList}
                        selectedUin={selectedUin}
                        onSelect={requestSwitchUin}
                    />
                )}
            </header>

            <SkeletonSwap
                ready={resources.qqList.ready}
                lines={7}
                lineHeight={28}
                barHeight={11}
                reserve={196}
                label="账号列表"
                className={resources.qqList.ready ? 'skeleton-swap-fluid min-h-[196px]' : ''}
            >
                {resources.qqList.ready ? (
                    resources.qqList.error && qqList.length === 0 ? (
                        <ConfigLoadError message={resources.qqList.error} onRetry={refreshQqList} />
                    ) : !selectedUin ? (
                        <EmptyState />
                    ) : (
                        <SkeletonSwap
                            ready={!loading}
                            lines={7}
                            lineHeight={28}
                            barHeight={11}
                            reserve={196}
                            label="账号配置"
                            className={!loading ? 'skeleton-swap-fluid min-h-[196px]' : 'w-full'}
                        >
                            {!loading ? (
                                loadError || !config ? (
                                    <ConfigLoadError
                                        message={loadError ?? '账号配置不可用'}
                                        onRetry={reload}
                                    />
                                ) : (
                                    <div className="cp-config-document">
                                        <TabStrip
                                            activeTab={activeTab}
                                            onChange={setActiveTab}
                                            counts={countMap(config.networks)}
                                        />
                                        <EditorBar
                                            title={
                                                activeTab === 'general'
                                                    ? '消息行为'
                                                    : NETWORK_TABS[activeTab].title
                                            }
                                            selectedUin={selectedUin}
                                            dirty={dirty}
                                            saveStatus={saveStatus}
                                            saveStatusTone={saveStatusTone}
                                            onSave={immediateSave}
                                            onCreate={
                                                activeTab !== 'general' &&
                                                config.networks[activeTab].length > 0
                                                    ? () => openCreate(activeTab as NetworkKind)
                                                    : undefined
                                            }
                                        />


                                        <div
                                            key={`${selectedUin}-${activeTab}`}
                                            className="cp-fade cp-config-body"
                                            id={`config-panel-${activeTab}`}
                                            role="tabpanel"
                                            aria-labelledby={`config-tab-${activeTab}`}
                                        >
                                            <fieldset
                                                disabled={saveStatusTone === 'saving'}
                                                className="min-w-0"
                                            >
                                                {activeTab === 'general' ? (
                                                    <GeneralSettingsTab
                                                        config={config}
                                                        onChange={updateGeneralSettings}
                                                    />
                                                ) : (
                                                    <NetworkTabView
                                                        kind={activeTab}
                                                        config={config}
                                                        statusByName={liveStatusByName}
                                                        busy={saveStatusTone === 'saving'}
                                                        onCreateClick={() => openCreate(activeTab)}
                                                        onEdit={(idx) => openEdit(activeTab, idx)}
                                                        onDelete={(idx) =>
                                                            handleDelete(activeTab, idx)
                                                        }
                                                        onToggleEnabled={(idx, v) =>
                                                            void handleToggleEnabled(
                                                                activeTab,
                                                                idx,
                                                                v,
                                                            ).catch(() => undefined)
                                                        }
                                                    />
                                                )}
                                            </fieldset>
                                        </div>
                                    </div>
                                )
                            ) : null}
                        </SkeletonSwap>
                    )
                ) : null}
            </SkeletonSwap>

            {/* Single dialog covers create + edit across all 4 kinds. */}
            {dialog.open && config && selectedUin && (
                <NodeEditDialog
                    key={`${selectedUin}-${dialog.kind}-${dialog.index ?? 'new'}`}
                    open={dialog.open}
                    onOpenChange={(open) => !open && setDialog({ open: false })}
                    kind={dialog.kind}
                    initial={dialog.seed}
                    isEdit={dialog.index != null}
                    otherNames={otherNames(config.networks, dialog.kind, dialog.index)}
                    uin={selectedUin}
                    onSubmit={(item) =>
                        dialog.index == null
                            ? handleCreate(dialog.kind, item)
                            : handleEdit(dialog.kind, dialog.index, item)
                    }
                />
            )}

            <ConfirmDialog
                open={pendingSwitchUin != null}
                onOpenChange={(open) => !open && cancelSwitch()}
                title="放弃未保存的修改？"
                description={
                    <>
                        <p>
                            当前会话 <code className="font-mono">{selectedUin}</code>{' '}
                            还有未保存的修改。
                        </p>
                        <p className="mt-2">
                            切换到{' '}
                            <code className="font-mono">
                                {pendingSwitchAccount?.uin ?? pendingSwitchUin}
                            </code>
                            {pendingSwitchAccount?.nickname
                                ? `（${pendingSwitchAccount.nickname}）`
                                : ''}{' '}
                            会丢弃这些修改。
                        </p>
                    </>
                }
                confirmText="放弃并切换"
                destructive
                onConfirm={confirmSwitch}
            />
        </div>
    );
}

// ─────────────── editor bar: unsaved state + apply ───────────────

interface EditorBarProps {
    title: string;
    selectedUin: string;
    dirty: boolean;
    saveStatus: string;
    saveStatusTone: 'idle' | 'saving' | 'success' | 'warning' | 'error';
    onSave: () => void;
    onCreate?: () => void;
}

function EditorBar({
    title,
    selectedUin,
    dirty,
    saveStatus,
    saveStatusTone,
    onSave,
    onCreate,
}: EditorBarProps) {
    return (
        <div className="cp-toolbar cp-editorbar">
            <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                <code className="mt-0.5 block font-mono text-xs text-muted-foreground tabular-nums">
                    UIN {selectedUin}
                </code>
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
                {(saveStatus || dirty) && (
                    <span
                        role={saveStatusTone === 'error' ? 'alert' : 'status'}
                        className="cp-save-state"
                    >
                        {saveStatusTone === 'saving' ? (
                            <>
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                <span className="text-muted-foreground">保存中</span>
                            </>
                        ) : saveStatusTone === 'success' ? (
                            <>
                                <Check className="size-3.5 text-success" />
                                <span className="text-success">{saveStatus}</span>
                            </>
                        ) : saveStatusTone === 'warning' ? (
                            <>
                                <span className="size-1.5 rounded-full bg-warning" />
                                <span className="text-warning">{saveStatus}</span>
                            </>
                        ) : saveStatusTone === 'error' ? (
                            <>
                                <span className="size-1.5 rounded-full bg-destructive" />
                                <span className="text-destructive">{saveStatus}</span>
                            </>
                        ) : (
                            <>
                                <span className="size-1.5 rounded-full bg-warning" />
                                <span className="text-warning">未保存</span>
                            </>
                        )}
                    </span>
                )}
                {onCreate && (
                    <Button
                        size="sm"
                        variant="glass"
                        onClick={onCreate}
                        disabled={saveStatusTone === 'saving'}
                    >
                        <Plus className="size-3.5" />
                        添加连接
                    </Button>
                )}
                <Button variant="glass" onClick={onSave} size="sm" disabled={saveStatusTone === 'saving'}>
                    <Save className="size-3.5" /> 立即保存
                </Button>
            </div>
        </div>
    );
}

// ─────────────── tab strip ───────────────

interface TabStripProps {
    activeTab: TabKey;
    onChange: (key: TabKey) => void;
    counts: Record<NetworkKind, number>;
}

function TabStrip({ activeTab, onChange, counts }: TabStripProps) {
    const id = useId();
    const reduced = useReducedMotionConfig();
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const moveTab = (from: number, direction: 1 | -1 | 'home' | 'end') => {
        const length = ALL_TABS.length;
        const nextIndex =
            direction === 'home'
                ? 0
                : direction === 'end'
                  ? length - 1
                  : (from + direction + length) % length;
        const next = ALL_TABS[nextIndex];

        if (!next) {
            return;
        }

        onChange(next);
        tabRefs.current[nextIndex]?.focus();
    };

    return (
        <GlassSurface className="cp-category-chrome">
            <ScrollableTabList
                activeValue={activeTab}
                role="tablist"
                aria-label="账号配置分类"
                className="gap-1"
            >
                {ALL_TABS.map((key, index) => {
                    const label = key === 'general' ? '消息行为' : NETWORK_TABS[key].title;
                    const count = key === 'general' ? null : counts[key];
                    const active = activeTab === key;
                    return (
                        <button
                            key={key}
                            ref={(element) => {
                                tabRefs.current[index] = element;
                            }}
                            id={`config-tab-${key}`}
                            role="tab"
                            type="button"
                            aria-selected={active}
                            aria-controls={`config-panel-${key}`}
                            data-tab-active={active ? 'true' : undefined}
                            tabIndex={active ? 0 : -1}
                            onClick={() => onChange(key)}
                            onKeyDown={(event) => {
                                if (event.key === 'ArrowRight') {
                                    event.preventDefault();
                                    moveTab(index, 1);
                                } else if (event.key === 'ArrowLeft') {
                                    event.preventDefault();
                                    moveTab(index, -1);
                                } else if (event.key === 'Home') {
                                    event.preventDefault();
                                    moveTab(index, 'home');
                                } else if (event.key === 'End') {
                                    event.preventDefault();
                                    moveTab(index, 'end');
                                }
                            }}
                            className={cn(
                                'cp-catnav-item whitespace-nowrap',
                                'focus-visible:ring-[3px] focus-visible:ring-ring/40',
                                active
                                    ? 'text-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {active && (
                                <motion.span
                                    aria-hidden="true"
                                    layoutId={reduced ? undefined : `config-category-${id}`}
                                    className="cp-selection"
                                    transition={
                                        reduced
                                            ? { duration: 0 }
                                            : { duration: 0.42, ease: [0.16, 1, 0.3, 1] }
                                    }
                                />
                            )}
                            <span className="relative">{label}</span>
                            {count != null && (
                                <span className="relative font-mono text-xs text-muted-foreground tabular-nums">
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </ScrollableTabList>
        </GlassSurface>
    );
}

function countMap(networks: OneBotNetworks): Record<NetworkKind, number> {
    return {
        httpServers: networks.httpServers.length,
        httpClients: networks.httpClients.length,
        wsServers: networks.wsServers.length,
        wsClients: networks.wsClients.length,
    };
}

// ─────────────── network tab body ───────────────

interface NetworkTabViewProps {
    kind: NetworkKind;
    config: OneBotConfig;
    statusByName: Map<string, AdapterStatus>;
    busy: boolean;
    onCreateClick: () => void;
    onEdit: (index: number) => void;
    onDelete: (index: number) => Promise<void>;
    onToggleEnabled: (index: number, enabled: boolean) => void;
}

function NetworkTabView({
    kind,
    config,
    statusByName,
    busy,
    onCreateClick,
    onEdit,
    onDelete,
    onToggleEnabled,
}: NetworkTabViewProps) {
    const tab = NETWORK_TABS[kind];
    const { runAction } = useActionFeedback();
    const [copyError, setCopyError] = useState('');
    const list = config.networks[kind];

    const copyEndpoint = async (item: (typeof list)[number]) => {
        try {
            await runAction(
                {
                    title: '正在复制连接地址',
                    successTitle: '地址已复制（不含令牌）',
                    errorTitle: '复制失败',
                },
                async () => {
                    const endpoint = connectionEndpoint(kind, item, window.location.href);

                    if (!(await copyText(endpoint))) {
                        throw new Error('无法写入剪贴板，请手动选中地址复制');
                    }
                },
            );
            setCopyError('');
        } catch (error) {
            setCopyError(error instanceof Error ? error.message : '复制失败');
        }
    };

    // `summarize` is typed per K in NETWORK_TABS; the union here forces a
    // widening cast at the call site rather than ladder-of-ifs per tab.
    const summarize = tab.summarize as (it: (typeof list)[number]) => string;

    // Tally name occurrences once instead of doing `list.filter(...).map(...).includes(...)`
    // inside `.map()` (O(n²) per render). With this lookup, the duplicate
    // check is O(1) per row — matters once the list grows past a few entries
    // or when typing renames a node and the tab re-renders on every keystroke.
    const nameCounts = useMemo(() => {
        const counts = new Map<string, number>();

        for (const item of list) {
            const name = item.name;

            if (!name) {
                continue;
            }

            counts.set(name, (counts.get(name) ?? 0) + 1);
        }

        return counts;
    }, [list]);

    if (list.length === 0) {
        return (
            <div className="cp-empty-state text-muted-foreground">
                <p className="text-sm">还没有{tab.title}连接</p>
                <Button variant="glass" size="sm" onClick={onCreateClick} disabled={busy}>
                    <Plus className="size-3.5" /> 添加连接
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
                {tab.description} · 复制地址不含令牌，请在机器人程序中单独填写。
            </p>
            {copyError && (
                <p role="alert" className="text-xs text-destructive">
                    {copyError}
                </p>
            )}
            <div className="cp-adapter-table">
                <div aria-hidden="true" className="cp-adapter-table-head">
                    <span>连接</span>
                    <span>地址与运行状态</span>
                    <span>操作</span>
                </div>
                {list.map((item, idx) => {
                    const duplicate = !!item.name && (nameCounts.get(item.name) ?? 0) > 1;
                    return (
                        <AdapterRow
                            key={`${item.name}-${idx}`}
                            item={item}
                            summary={summarize(item)}
                            duplicateName={duplicate}
                            busy={busy}
                            liveStatus={statusByName.get(item.name)}
                            onToggleEnabled={(v) => onToggleEnabled(idx, v)}
                            onEdit={() => onEdit(idx)}
                            onCopy={() => void copyEndpoint(item)}
                            onDelete={() => onDelete(idx)}
                        />
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────── empty + loading ───────────────

function EmptyState() {
    return (
        <div className="cp-empty-state text-muted-foreground">
            <MousePointerClick className="size-8 opacity-40" strokeWidth={1.5} />
            <p className="text-sm">先选择 QQ 账号，再设置连接方式和状态回复。</p>
            <p className="text-xs">
                没有账号时，先连接并登录 QQ。#nl 状态回复可在“消息行为”中关闭。
            </p>
        </div>
    );
}

function ConfigLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="cp-empty-state text-muted-foreground">
            <p role="alert" className="max-w-xl break-words text-sm text-destructive">
                {message}
            </p>
            <Button variant="glass" size="sm" onClick={onRetry}>
                重试
            </Button>
        </div>
    );
}

// ─────────────── helpers ───────────────

/** Names of every adapter except the one currently being edited. */
function otherNames<K extends NetworkKind>(
    networks: OneBotNetworks,
    kind: K,
    excludeIndex: number | null,
): string[] {
    const list = networks[kind];
    return list
        .filter((_, i) => i !== excludeIndex)
        .map((n) => n.name)
        .filter((s): s is string => typeof s === 'string' && s.length > 0);
}
