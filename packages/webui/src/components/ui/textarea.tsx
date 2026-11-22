import * as React from 'react';
import { cn } from '@/lib/utils';

// Shares Input's stable surface and visible focus ring. Callers may override
// height, resize and typography via className.
const Textarea = React.forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
    <textarea
        ref={ref}
        data-ui-control=""
        className={cn(
            'ui-glass-field flex min-h-11 w-full min-w-0 appearance-none rounded-[var(--radius)] border px-3 py-2 text-base transition-colors outline-none md:text-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
            className,
        )}
        {...props}
    />
));
Textarea.displayName = 'Textarea';

export { Textarea };
