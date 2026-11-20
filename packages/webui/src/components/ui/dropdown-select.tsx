import { Dropdown } from '@/components/interior/dropdown';

export interface DropdownOption<T extends string> {
    value: T;
    label: string;
}

interface DropdownSelectProps<T extends string> {
    value: T;
    options: ReadonlyArray<DropdownOption<T>>;
    onChange: (v: T) => void;
    ariaLabel: string;
    className?: string;
    disabled?: boolean;
}

/** Shared keyboard-accessible select; disabling it also disables its open menu. */
export function DropdownSelect<T extends string>({
    value,
    options,
    onChange,
    ariaLabel,
    className,
    disabled,
}: DropdownSelectProps<T>) {
    return (
        <Dropdown
            value={value}
            items={options.map((option) => ({ ...option }))}
            onChange={(next) => onChange(next as T)}
            label={ariaLabel}
            className={className}
            disabled={disabled}
        />
    );
}
