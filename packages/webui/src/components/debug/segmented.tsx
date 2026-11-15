import { SegmentedControl } from '@/components/interior/segmented-control';

export function Segmented<T extends string>({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string }[];
}) {
    return (
        <SegmentedControl
            label={label}
            value={value}
            options={options}
            onValueChange={(next) => {
                const option = options.find((item) => item.value === next);

                if (option) {
                    onChange(option.value);
                }
            }}
        />
    );
}
