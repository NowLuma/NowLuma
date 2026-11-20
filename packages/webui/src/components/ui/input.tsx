import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, type, ...props }, ref) => (
        <input
            type={type}
            ref={ref}
            data-ui-control=""
            className={cn(
                'flex h-11 w-full min-w-0 appearance-none rounded-[var(--radius)] border border-border bg-transparent px-3 py-1 text-base transition-colors outline-none md:text-sm',
                'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
                'placeholder:text-muted-foreground',
                'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
                className,
            )}
            {...props}
        />
    ),
);
Input.displayName = 'Input';

export { Input };
