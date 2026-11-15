// Account context strip. The selected QQ account is the context for every
// adapter below it; switching routes through `requestSwitchUin` so the
// unsaved-edit confirmation still gates the switch. A horizontally scrolling
// chip row replaces the former collapsible vertical rail.

import { useId } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { ScrollableTabList } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { QQInfo } from '@/types';

function qqAvatarUrl(uin: string) {
    return `/avatar/${encodeURIComponent(uin)}`;
}

interface AccountContextStripProps {
    accounts: QQInfo[];
    selectedUin: string | null;
    onSelect: (uin: string) => void;
}

export function AccountContextStrip({ accounts, selectedUin, onSelect }: AccountContextStripProps) {
    const id = useId();
    const reduced = useReducedMotionConfig();
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">账号</span>
            <ScrollableTabList
                activeValue={selectedUin ?? ''}
                role="group"
                aria-label="选择账号"
                className="gap-1 py-1"
            >
                {accounts.map((q) => {
                    const active = selectedUin === q.uin;
                    return (
                        <button
                            key={q.uin}
                            type="button"
                            aria-pressed={active}
                            data-tab-active={active ? 'true' : undefined}
                            onClick={() => onSelect(q.uin)}
                            className="cp-acct-chip outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {active && (
                                <motion.span
                                    aria-hidden="true"
                                    layoutId={reduced ? undefined : `account-context-${id}`}
                                    className="cp-selection"
                                    transition={
                                        reduced
                                            ? { duration: 0 }
                                            : { duration: 0.42, ease: [0.16, 1, 0.3, 1] }
                                    }
                                />
                            )}
                            <Avatar size={32} className="relative">
                                <AvatarImage src={qqAvatarUrl(q.uin)} alt={q.nickname || q.uin} />
                                <AvatarFallback>{(q.nickname || q.uin).slice(0, 2)}</AvatarFallback>
                            </Avatar>
                            <span className="relative min-w-0 text-left">
                                <span className="block max-w-[9rem] truncate text-sm font-medium">
                                    {q.nickname || q.uin}
                                </span>
                                <span className="block truncate font-mono text-micro text-muted-foreground tabular-nums">
                                    {q.uin}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </ScrollableTabList>
        </div>
    );
}
