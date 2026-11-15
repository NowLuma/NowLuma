'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const EASE = [0.23, 1, 0.32, 1] as const;
const DISCLOSE = { type: 'spring', stiffness: 190, damping: 30, mass: 1 } as const;
const NUDGE = { type: 'spring', stiffness: 700, damping: 46, mass: 0.5 } as const;
const INSTANT = { duration: 0 } as const;

export type BannerState = 'open' | 'folded' | 'dismissed';

export type UseCollapsibleBannerOptions = {
    state?: BannerState;
    defaultState?: BannerState;
    onStateChange?: (state: BannerState) => void;
    onDismiss?: () => void;
};

export type UseCollapsibleBannerResult = {
    state: BannerState;
    open: boolean;
    folded: boolean;
    dismissed: boolean;
    fold: () => void;
    expand: () => void;
    toggle: () => void;
    dismiss: () => void;
    restore: () => void;
};

export function useCollapsibleBanner({
    state: controlled,
    defaultState = 'open',
    onStateChange,
    onDismiss,
}: UseCollapsibleBannerOptions = {}): UseCollapsibleBannerResult {
    const [uncontrolled, setUncontrolled] = useState<BannerState>(defaultState);
    const state = controlled ?? uncontrolled;

    const changed = useRef(onStateChange);
    const closed = useRef(onDismiss);
    useEffect(() => {
        changed.current = onStateChange;
    }, [onStateChange]);
    useEffect(() => {
        closed.current = onDismiss;
    }, [onDismiss]);

    const commit = useCallback((next: BannerState) => {
        setUncontrolled(next);
        changed.current?.(next);
    }, []);

    const fold = useCallback(() => commit('folded'), [commit]);
    const expand = useCallback(() => commit('open'), [commit]);
    const restore = useCallback(() => commit('open'), [commit]);

    const toggle = useCallback(() => commit(state === 'open' ? 'folded' : 'open'), [commit, state]);

    const dismiss = useCallback(() => {
        commit('dismissed');
        closed.current?.();
    }, [commit]);

    return {
        state,
        open: state === 'open',
        folded: state === 'folded',
        dismissed: state === 'dismissed',
        fold,
        expand,
        toggle,
        dismiss,
        restore,
    };
}

const NOTICE_GLYPH = (
    <svg width="16" height="16" viewBox="0 0 256 256" fill="none" aria-hidden="true">
        <circle cx="128" cy="128" r="96" stroke="currentColor" strokeWidth="16" />
        <polyline
            points="120 120 128 120 128 176 136 176"
            stroke="currentColor"
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <circle cx="124" cy="84" r="12" fill="currentColor" />
    </svg>
);

const CARET_DOWN = (
    <svg width="14" height="14" viewBox="0 0 256 256" fill="none" aria-hidden="true">
        <polyline
            points="208 96 128 176 48 96"
            stroke="currentColor"
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const CLOSE = (
    <svg width="13" height="13" viewBox="0 0 256 256" fill="none" aria-hidden="true">
        <line
            x1="200"
            y1="56"
            x2="56"
            y2="200"
            stroke="currentColor"
            strokeWidth="16"
            strokeLinecap="round"
        />
        <line
            x1="200"
            y1="200"
            x2="56"
            y2="56"
            stroke="currentColor"
            strokeWidth="16"
            strokeLinecap="round"
        />
    </svg>
);

export type CollapsibleBannerProps = {
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    action?: React.ReactNode;
    icon?: React.ReactNode;

    dismissible?: boolean;
    state?: BannerState;
    defaultState?: BannerState;
    onStateChange?: (state: BannerState) => void;
    onDismiss?: () => void;
    onDismissed?: () => void;
    dismissLabel?: string;
    dismissedMessage?: string;
    className?: string;
};

export function CollapsibleBanner({
    title,
    description,
    children,
    action,
    icon,
    dismissible = true,
    state: controlled,
    defaultState = 'open',
    onStateChange,
    onDismiss,
    onDismissed,
    dismissLabel = 'Dismiss notice',
    dismissedMessage = 'Notice dismissed.',
    className = '',
}: CollapsibleBannerProps) {
    const reduced = useReducedMotionConfig() === true;
    const uid = useId();
    const bodyId = `${uid}-body`;
    const titleId = `${uid}-title`;

    const { state, open, dismissed, toggle, fold, dismiss } = useCollapsibleBanner({
        state: controlled,
        defaultState,
        onStateChange,
        onDismiss,
    });
    const wasVisible = useRef(false);
    const finishDismissal = useCallback(() => {
        if (dismissed && wasVisible.current) {
            wasVisible.current = false;
            onDismissed?.();
        }
    }, [dismissed, onDismissed]);
    useEffect(() => {
        if (!dismissed) {
            wasVisible.current = true;
        } else if (reduced) {
            finishDismissal();
        }
    }, [dismissed, reduced, finishDismissal]);

    const hasBody = Boolean(description || children || action);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const [heights, setHeights] = useState<{ open: number; folded: number } | null>(null);

    useIsoLayoutEffect(() => {
        const read = () => {
            const surface = surfaceRef.current;
            const body = bodyRef.current;

            if (!surface || surface.offsetHeight <= 0 || surface.offsetWidth <= 0) {
                return;
            }

            // Measure natural content once; only the outer shell controls height.
            const open = surface.offsetHeight;
            const folded = open - (body?.offsetHeight ?? 0);
            setHeights((previous) =>
                previous?.open === open && previous.folded === folded ? previous : { open, folded },
            );
        };

        read();

        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        const observer = new ResizeObserver(read);

        if (surfaceRef.current) {
            observer.observe(surfaceRef.current);
        }

        if (bodyRef.current) {
            observer.observe(bodyRef.current);
        }

        return () => observer.disconnect();
    }, [title, description, children, action, hasBody]);

    return (
        <>
            <motion.div
                initial={reduced ? false : { height: 0, opacity: 0 }}
                animate={{
                    height: dismissed ? 0 : (heights?.[open ? 'open' : 'folded'] ?? 'auto'),
                    opacity: dismissed ? 0 : 1,
                }}
                transition={
                    reduced
                        ? INSTANT
                        : { height: DISCLOSE, opacity: { duration: 0.14, ease: EASE } }
                }
                style={{ overflow: 'hidden' }}
                onAnimationComplete={finishDismissal}
                className="rounded-[14px]"
            >
                <div
                    ref={surfaceRef}
                    role="region"
                    aria-labelledby={titleId}
                    aria-hidden={dismissed}
                    inert={dismissed}
                    className={`action-feedback-surface rounded-[14px] border border-border/80 bg-popover/95 text-popover-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_16px_36px_-18px_rgb(0_0_0/0.5)] backdrop-blur-xl ${className}`}
                >
                    <div className="flex items-center gap-2.5 px-2.5 py-1">
                        <span
                            aria-hidden="true"
                            className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-muted/70 text-muted-foreground shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)]"
                        >
                            {icon ?? NOTICE_GLYPH}
                        </span>

                        {hasBody ? (
                            <button
                                type="button"
                                onClick={toggle}
                                onKeyDown={(e) => {
                                    if (e.key !== 'Escape' || !open) {
                                        return;
                                    }

                                    e.stopPropagation();
                                    fold();
                                }}
                                aria-expanded={open}
                                aria-controls={bodyId}
                                className="group flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[7px] text-left outline-none focus-visible:bg-primary/10 focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <span
                                    id={titleId}
                                    className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground"
                                >
                                    {title}
                                </span>
                                <motion.span
                                    aria-hidden="true"
                                    className="flex shrink-0 text-muted-foreground group-hover:text-foreground"
                                    initial={false}
                                    animate={{ rotate: open ? 180 : 0 }}
                                    transition={reduced ? INSTANT : NUDGE}
                                >
                                    {CARET_DOWN}
                                </motion.span>
                            </button>
                        ) : (
                            <span
                                id={titleId}
                                className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground"
                            >
                                {title}
                            </span>
                        )}

                        {dismissible ? (
                            <button
                                type="button"
                                onClick={dismiss}
                                aria-label={dismissLabel}
                                className="grid size-11 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                {CLOSE}
                            </button>
                        ) : null}
                    </div>

                    {hasBody ? (
                        <motion.div
                            ref={bodyRef}
                            id={bodyId}
                            aria-hidden={!open || dismissed}
                            inert={!open || dismissed}
                            initial={false}
                            animate={{ opacity: open ? 1 : 0 }}
                            transition={reduced ? INSTANT : { duration: 0.14, ease: EASE }}
                        >
                            <div className="pb-2.5 pl-[46px] pr-2.5">
                                {description ? (
                                    <p className="break-words text-[12.5px] leading-relaxed text-muted-foreground">
                                        {description}
                                    </p>
                                ) : null}

                                {children}

                                {action ? <div className="mt-2">{action}</div> : null}
                            </div>
                        </motion.div>
                    ) : null}
                </div>
            </motion.div>
            <span role="status" aria-live="polite" className="sr-only">
                {state === 'dismissed' ? dismissedMessage : ''}
            </span>
        </>
    );
}
