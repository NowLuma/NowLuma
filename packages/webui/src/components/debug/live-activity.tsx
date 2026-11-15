// LiveActivity — the merged live SSE of OneBot events + action calls across all
// accounts. Extracted from the debug page so it can stand alone as a console
// tab. Filter by kind, keyword-search, pause, clear, and export the buffer as
// JSON. Rows expand to a JsonTree of the full payload.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import {
    Activity,
    ChevronRight,
    Download,
    Pause,
    Play,
    RadioTower,
    Search,
    Trash2,
} from 'lucide-react';
import { JsonTree } from '@/components/ui/json-tree';
import { GlassMaterial } from '@/components/ui/glass-material';
import { Segmented } from '@/components/debug/segmented';
import { useApi } from '@/lib/api';
import { cn, downloadBlob } from '@/lib/utils';
import type { DebugStreamMessage } from '@/types';

const STREAM_CAP = 300;
const cardCls = 'cp-panel';

interface StreamRow {
    id: number;
    at: number;
    msg: Extract<DebugStreamMessage, { kind: 'event' | 'action' | 'dropped' }>;
    search: string;
}

function IconBtn({
    onClick,
    title,
    children,
}: {
    onClick: () => void;
    title: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            className="ui-button flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
            {children}
        </button>
    );
}

function StatusPill({
    status,
    paused,
}: {
    status: 'open' | 'reconnecting' | 'closed';
    paused?: boolean;
}) {
    // A deliberate pause reads as "已暂停", distinct from an unwanted disconnect.
    const map = paused
        ? { dot: 'bg-muted-foreground/50', label: '已暂停', glow: '' }
        : {
              open: {
                  dot: 'bg-emerald-500',
                  label: '已连接',
                  glow: 'shadow-[0_0_0_3px_rgb(16_185_129/0.15)]',
              },
              reconnecting: {
                  dot: 'bg-amber-500',
                  label: '重连中',
                  glow: 'shadow-[0_0_0_3px_rgb(245_158_11/0.15)]',
              },
              closed: { dot: 'bg-muted-foreground/50', label: '未连接', glow: '' },
          }[status];
    return (
        <div
            role="status"
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-medium"
        >
            <span className={cn('h-2 w-2 rounded-full', map.dot, map.glow)} />
            <span className="text-muted-foreground">{map.label}</span>
        </div>
    );
}

function rowLabel(msg: Extract<DebugStreamMessage, { kind: 'event' | 'action' }>): {
    label: string;
    detail: unknown;
    isAction: boolean;
    ok: boolean;
} {
    if (msg.kind === 'event') {
        const e = msg.event as Record<string, unknown>;
        return {
            label: `${e.post_type ?? 'event'}${e.message_type ? `.${e.message_type}` : e.notice_type ? `.${e.notice_type}` : ''}`,
            detail: e,
            isAction: false,
            ok: true,
        };
    }

    // action
    return {
        label: msg.action,
        detail: { params: msg.params, response: msg.response },
        isAction: true,
        ok: (msg.response as { status?: string }).status === 'ok',
    };
}

function StreamRowItem({ row }: { row: StreamRow }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const reduced = useReducedMotionConfig();
    const { msg } = row;
    const time = new Date(row.at).toLocaleTimeString('zh-CN', { hour12: false });

    if (msg.kind === 'dropped') {
        return (
            <div className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                因客户端过慢丢弃了 {msg.count} 条
            </div>
        );
    }

    const { label, detail, isAction, ok } = rowLabel(msg);
    return (
        <div className="cp-action-row group transition-colors hover:bg-muted/40">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((v) => !v)}
                className="flex min-h-16 w-full items-start gap-3 px-3 py-3 text-left text-[13px]"
            >
                <ChevronRight
                    className={cn(
                        'mt-1 size-4 shrink-0 text-muted-foreground transition-transform',
                        open && 'rotate-90',
                    )}
                />
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono tabular-nums">{time}</span>
                        <span
                            className={cn(
                                'rounded px-1.5 py-0.5 text-micro font-semibold',
                                isAction
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-muted text-muted-foreground',
                            )}
                        >
                            {isAction ? '调用' : '事件'}
                        </span>
                        <span className="font-mono">{msg.uin}</span>
                    </span>
                    <span className="mt-1 block break-all font-mono">{label}</span>
                </span>
                {msg.kind === 'action' && (
                    <span
                        className={cn(
                            'shrink-0 text-right text-xs tabular-nums',
                            ok ? 'text-success' : 'text-destructive',
                        )}
                    >
                        <span className="block">{ok ? 'ok' : 'failed'}</span>
                        <span className="text-muted-foreground">{msg.ms}ms</span>
                    </span>
                )}
            </button>
            <div id={id} inert={!open} aria-hidden={!open}>
                <AnimatePresence initial={false}>
                    {open && (
                        <motion.div
                            key="detail"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="mx-3 mb-3">
                                <JsonTree data={detail} maxHeight="18rem" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export function LiveActivity() {
    const reduced = useReducedMotionConfig();
    const api = useApi();
    const [rows, setRows] = useState<StreamRow[]>([]);
    const [paused, setPaused] = useState(false);
    const [status, setStatus] = useState<'open' | 'reconnecting' | 'closed'>('closed');
    const [kindFilter, setKindFilter] = useState<'all' | 'event' | 'action'>('all');
    const [query, setQuery] = useState('');
    const idRef = useRef(0);

    // Pausing truly drops the live fetch stream instead of connecting-and-discarding:
    // `paused` is an effect dependency, so it closes the stream on pause and
    // reopens it on resume. (The always-on-across-tabs behaviour is intentional —
    // debug-page keeps this mounted so actions fired from other tabs still land in
    // the feed — so only an explicit pause severs the connection.)
    useEffect(() => {
        if (paused) {
            return;
        }

        const off = api.debug.stream(
            (m) => {
                if (m.kind === 'ready') {
                    return;
                }

                setRows((prev) => {
                    // Precompute the search haystack once at enqueue, so filtering never
                    // re-stringifies every row on each keystroke.
                    const next = [
                        {
                            id: idRef.current++,
                            at: Date.now(),
                            msg: m,
                            search: JSON.stringify(m).toLowerCase(),
                        },
                        ...prev,
                    ];
                    return next.length > STREAM_CAP ? next.slice(0, STREAM_CAP) : next;
                });
            },
            (s) => setStatus(s),
        );
        return off;
    }, [paused, api]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            if (kindFilter !== 'all' && r.msg.kind !== kindFilter) {
                return false;
            }

            if (!q) {
                return true;
            }

            if (r.msg.kind === 'dropped') {
                return false;
            }

            const { label } = rowLabel(r.msg);
            return label.toLowerCase().includes(q) || r.msg.uin.includes(q) || r.search.includes(q);
        });
    }, [rows, kindFilter, query]);

    const exportJson = () => {
        downloadBlob(
            new Blob(
                [
                    JSON.stringify(
                        visible.map((r) => ({ at: r.at, ...r.msg })),
                        null,
                        2,
                    ),
                ],
                { type: 'application/json' },
            ),
            `debug-activity-${visible.length}.json`,
        );
    };

    return (
        <motion.section
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.28 }}
            className={cn(cardCls, 'flex min-h-[28rem] min-w-0 flex-col p-4 sm:p-6')}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                    <RadioTower className="h-[18px] w-[18px] text-primary" />
                    <h2 className="text-[15px] font-semibold tracking-tight">实时活动</h2>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {visible.length}
                    </span>
                    <StatusPill status={status} paused={paused} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                        label="活动类型"
                        value={kindFilter}
                        onChange={setKindFilter}
                        options={[
                            { value: 'all', label: '全部' },
                            { value: 'event', label: '事件' },
                            { value: 'action', label: '调用' },
                        ]}
                    />
                    <IconBtn onClick={() => setPaused((v) => !v)} title={paused ? '继续' : '暂停'}>
                        {paused ? (
                            <Play className="optical-forward h-4 w-4" />
                        ) : (
                            <Pause className="h-4 w-4" />
                        )}
                    </IconBtn>
                    <IconBtn onClick={exportJson} title="导出 JSON">
                        <Download className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn onClick={() => setRows([])} title="清空">
                        <Trash2 className="h-4 w-4" />
                    </IconBtn>
                </div>
            </div>

            <div className="ui-glass ui-glass-search cp-search mt-4">
                <GlassMaterial />
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                    type="search"
                    aria-label="搜索活动类型、账号或内容"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索类型 / 账号 / 内容…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
            </div>

            <div className="mt-4 flex min-w-0 flex-1 flex-col">
                {visible.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
                            <Activity className="h-6 w-6 text-muted-foreground/70" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {paused
                                ? '已暂停'
                                : query || kindFilter !== 'all'
                                  ? '无匹配'
                                  : '等待事件…'}
                        </p>
                    </div>
                ) : (
                    visible.map((r) => <StreamRowItem key={r.id} row={r} />)
                )}
            </div>
        </motion.section>
    );
}
