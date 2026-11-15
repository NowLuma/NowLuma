import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react';
import type { Sun } from 'lucide-react';
import { SegmentedControl } from '@/components/interior/segmented-control';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

// ─────────────── shared little controls ───────────────

export interface Opt<T> {
    value: T;
    label: string;
    icon?: typeof Sun;
}

// Associates a SettingRow's visible label with the control inside it (so the
// segmented radiogroup gets an accessible name without prop-threading).
const RowLabelContext = createContext<{ id: string; label: string } | undefined>(undefined);

// iOS/macOS segmented control: a recessed track with a raised pill on the
// selected segment. Single-select → exposed as a radiogroup.
export function Segmented<T extends string | number>({
    value,
    options,
    onChange,
    disabled,
}: {
    value: T;
    options: Opt<T>[];
    onChange: (v: T) => void;
    disabled?: boolean;
}) {
    const rowLabel = useContext(RowLabelContext);
    return (
        <div
            aria-labelledby={rowLabel?.id}
            aria-disabled={disabled || undefined}
            className={cn('max-w-full overflow-x-auto', disabled && 'opacity-50')}
        >
            <SegmentedControl
                className="min-w-max"
                label={rowLabel?.label ?? '选项'}
                value={String(value)}
                options={options.map((option) => ({
                    value: String(option.value),
                    label: option.label,
                    disabled,
                }))}
                onValueChange={(next) => {
                    const option = options.find((candidate) => String(candidate.value) === next);

                    if (option) {
                        onChange(option.value);
                    }
                }}
            />
        </div>
    );
}

/**
 * A grouped-list row. `layout`:
 *  - 'auto'   — control sits right of the label on sm+, stacks under it on mobile (short controls)
 *  - 'inline' — control always pinned right (switches)
 *  - 'stack'  — control always full-width under the label (color grids, sliders, wide segments)
 */
export function SettingRow({
    label,
    hint,
    children,
    layout = 'auto',
}: {
    label: string;
    hint?: ReactNode;
    children: ReactNode;
    layout?: 'auto' | 'inline' | 'stack';
}) {
    const labelId = useId();
    const head = (
        <div className="min-w-0">
            <p id={labelId} className="text-sm font-medium">
                {label}
            </p>
            {hint && (
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{hint}</p>
            )}
        </div>
    );
    const control = (
        <RowLabelContext.Provider value={{ id: labelId, label }}>
            {children}
        </RowLabelContext.Provider>
    );

    if (layout === 'stack') {
        return (
            <div className="flex flex-col gap-3 px-5 py-4">
                {head}
                {control}
            </div>
        );
    }

    if (layout === 'inline') {
        return (
            <div className="flex items-center justify-between gap-4 px-5 py-4">
                {head}
                <div className="shrink-0">{control}</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            {head}
            <div className="min-w-0 sm:shrink-0 sm:max-w-full">{control}</div>
        </div>
    );
}

export function SliderSettingRow({
    label,
    hint,
    ...sliderProps
}: {
    label: string;
    hint?: ReactNode;
} & Omit<ComponentProps<typeof Slider>, 'label'>) {
    const hintId = useId();
    return (
        <div className="flex flex-col gap-2.5 px-5 py-4">
            <Slider {...sliderProps} label={label} aria-describedby={hint ? hintId : undefined} />
            {hint && (
                <p id={hintId} className="text-[12px] leading-snug text-muted-foreground">
                    {hint}
                </p>
            )}
        </div>
    );
}

// Section context stays beside its controls on wide screens.
export function Group({
    title,
    description,
    icon: Icon,
    children,
}: {
    title: string;
    description?: ReactNode;
    icon?: typeof Sun;
    children: ReactNode;
}) {
    const titleId = useId();
    return (
        <section aria-labelledby={titleId} className="cp-settings-group">
            <header className="flex min-w-0 flex-col gap-2 pt-1">
                <h2 id={titleId} className="flex items-center gap-2 text-[15px] font-semibold">
                    {Icon && <Icon className="size-4 text-muted-foreground" />}
                    {title}
                </h2>
                {description && (
                    <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                        {description}
                    </p>
                )}
            </header>
            <div className="cp-settings-rows divide-y divide-border/60">{children}</div>
        </section>
    );
}
