// ApiBrowser — an embedded, searchable reference for every declarative action
// (~520), grouped by category, surfaced straight from /api/debug/actions (the
// same docs the tester uses). Each row expands to params / returns / invariants
// and a 试一下 button that prefills the tester. No hand-maintained docs — this
// is the live catalog.
import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { BookOpen, ChevronRight, PlayCircle, Search, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassMaterial } from '@/components/ui/glass-material';
import type { DebugActionDoc } from '@/types';

const cardCls = 'cp-panel';

function ActionRow({ doc, onTry }: { doc: DebugActionDoc; onTry: (name: string) => void }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const reduced = useReducedMotionConfig();
    return (
        <div className="cp-action-row">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls={id}
                className="flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
                <ChevronRight
                    className={cn(
                        'mt-1 size-4 shrink-0 text-muted-foreground transition-transform',
                        open && 'rotate-90',
                    )}
                />
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 break-all font-mono text-[13px] font-medium">
                            {doc.name}
                        </code>
                        {doc.readOnly ? (
                            <ShieldCheck
                                className="size-3.5 shrink-0 text-success"
                                aria-label="只读"
                            />
                        ) : (
                            <span
                                className="size-1.5 shrink-0 rounded-full bg-warning"
                                title="有副作用"
                            />
                        )}
                        {doc.stream && (
                            <Zap className="size-3.5 shrink-0 text-primary" aria-label="流式" />
                        )}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {doc.summary}
                    </span>
                </span>
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
                            <div className="flex flex-col gap-3 border-t border-border/50 px-4 py-4 text-[13px]">
                                {doc.aliases.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        别名:
                                        {doc.aliases.map((a) => (
                                            <code key={a} className="ml-1 font-mono">
                                                {a}
                                            </code>
                                        ))}
                                    </p>
                                )}
                                {doc.params.length > 0 ? (
                                    <div className="overflow-x-auto rounded-lg border border-border/50">
                                        <table className="w-full min-w-[28rem] text-left text-xs">
                                            <thead className="bg-muted/40 text-muted-foreground">
                                                <tr>
                                                    <th className="px-2 py-1 font-medium">参数</th>
                                                    <th className="px-2 py-1 font-medium">类型</th>
                                                    <th className="px-2 py-1 font-medium">必填</th>
                                                    <th className="px-2 py-1 font-medium">说明</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {doc.params.map((p) => (
                                                    <tr
                                                        key={p.name}
                                                        className="border-t border-border/40"
                                                    >
                                                        <td className="px-2 py-1 font-mono">
                                                            {p.name}
                                                        </td>
                                                        <td className="px-2 py-1 font-mono text-muted-foreground">
                                                            {p.values
                                                                ? p.values.map(String).join(' | ')
                                                                : p.type}
                                                            {p.role ? (
                                                                <span className="ml-1 text-primary/70">
                                                                    ·{p.role}
                                                                </span>
                                                            ) : null}
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            {p.required ? '✓' : '–'}
                                                        </td>
                                                        <td className="px-2 py-1 text-muted-foreground">
                                                            {p.desc ?? ''}
                                                            {p.default !== undefined
                                                                ? ` (默认 ${JSON.stringify(p.default)})`
                                                                : ''}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">无参数</p>
                                )}
                                {doc.invariants && doc.invariants.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        约束:{doc.invariants.join('；')}
                                    </p>
                                )}
                                {doc.returns && (
                                    <p className="text-xs text-muted-foreground">
                                        返回:<code className="font-mono">{doc.returns}</code>
                                    </p>
                                )}
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => onTry(doc.name)}
                                        className="cp-control inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
                                    >
                                        <PlayCircle className="h-3.5 w-3.5" /> 试一下
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export function ApiBrowser({
    docs,
    onTry,
}: {
    docs: DebugActionDoc[];
    onTry: (name: string) => void;
}) {
    const reduced = useReducedMotionConfig();
    const [query, setQuery] = useState('');
    const [cat, setCat] = useState<string>('');

    const categories = useMemo(() => {
        const set = new Set<string>();

        for (const d of docs) {
            if (d.category) {
                set.add(d.category);
            }
        }

        return Array.from(set).sort();
    }, [docs]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return docs.filter((d) => {
            if (cat && d.category !== cat) {
                return false;
            }

            if (!q) {
                return true;
            }

            return (
                d.name.toLowerCase().includes(q) ||
                (d.summary?.toLowerCase().includes(q) ?? false) ||
                d.aliases.some((a) => a.toLowerCase().includes(q))
            );
        });
    }, [docs, query, cat]);

    const grouped = useMemo(() => {
        const m = new Map<string, DebugActionDoc[]>();

        for (const d of filtered) {
            const k = d.category ?? '其他';
            const arr = m.get(k) ?? [];
            arr.push(d);
            m.set(k, arr);
        }

        return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [filtered]);

    return (
        <motion.section
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.28 }}
            className={cn(cardCls, 'flex min-h-[28rem] min-w-0 flex-col gap-5 p-4 sm:p-6')}
        >
            <div className="flex items-center gap-2.5">
                <BookOpen className="h-[18px] w-[18px] text-primary" />
                <h2 className="text-[15px] font-semibold tracking-tight">接口库</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {filtered.length}/{docs.length}
                </span>
            </div>

            <div className="ui-glass ui-glass-search cp-search">
                <GlassMaterial />
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                    type="search"
                    aria-label="搜索接口名、摘要或别名"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索接口名、摘要或别名…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
            </div>

            <div role="group" aria-label="接口分类" className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => setCat('')}
                    aria-pressed={cat === ''}
                    className={cn(
                        'cp-control rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        cat === ''
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/70 text-muted-foreground hover:text-foreground',
                    )}
                >
                    全部
                </button>
                {categories.map((c) => (
                    <button
                        key={c}
                        type="button"
                        onClick={() => setCat(c)}
                        aria-pressed={cat === c}
                        className={cn(
                            'cp-control rounded-full px-3 py-1 text-xs font-medium transition-colors',
                            cat === c
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/70 text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {c}
                    </button>
                ))}
            </div>

            <div className="flex min-w-0 flex-col gap-6">
                {grouped.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                        没有匹配的接口
                    </p>
                ) : (
                    grouped.map(([category, items]) => (
                        <div key={category} className="flex flex-col gap-1.5">
                            <h3 className="px-1 text-xs font-semibold text-muted-foreground">
                                {category}{' '}
                                <span className="font-normal tabular-nums">{items.length}</span>
                            </h3>
                            <div className="overflow-hidden rounded-xl border border-border">
                                {items.map((d) => (
                                    <ActionRow key={d.name} doc={d} onTry={onTry} />
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </motion.section>
    );
}
