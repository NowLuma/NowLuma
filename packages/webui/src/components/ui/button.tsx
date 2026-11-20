import * as React from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { GlassMaterial } from '@/components/ui/glass-material';

const buttonVariants = cva(
    "ui-button inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] text-sm font-medium transition-[color,background-color,border-color,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer",
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95',
                destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                outline:
                    'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                ghost: 'hover:bg-accent hover:text-accent-foreground',
                link: 'text-primary underline-offset-4 hover:underline',
                glass: 'ui-glass ui-glass-action rounded-full text-foreground hover:text-foreground',
            },
            size: {
                default: 'h-11 px-4 py-2',
                sm: 'h-11 px-3 text-xs',
                lg: 'h-12 px-6',
                icon: 'ui-button-icon size-11',
                'icon-sm': 'ui-button-icon size-11',
            },
        },
        defaultVariants: { variant: 'default', size: 'default' },
    },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {
    asChild?: boolean;
    /** Opt out of press feedback inside glass chrome; document actions never scale. */
    static?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, children, asChild = false, static: isStatic = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return (
            <Comp
                className={cn(buttonVariants({ variant, size }), className)}
                ref={ref}
                data-press-scale={isStatic ? undefined : ''}
                data-variant={variant ?? 'default'}
                {...props}
            >
                {variant === 'glass' && <GlassMaterial />}
                {asChild ? <Slottable>{children}</Slottable> : children}
            </Comp>
        );
    },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
