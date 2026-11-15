import { useDropdown } from '@/components/interior/dropdown';
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { GlassMaterial } from '@/components/ui/glass-material';
import { paletteResolved, useTheme, type ThemeMode } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import '@/styles/workspace.css';

const OPTIONS: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
    { value: 'system', icon: Monitor, label: '跟随系统' },
    { value: 'light', icon: Sun, label: '浅色' },
    { value: 'dark', icon: Moon, label: '深色' },
];

export function ThemeToggle({ className }: { className?: string }) {
    const { appearance, mode, setMode, managedBy } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const { open, activeIndex, rootRef, triggerProps, listProps, getItemProps } = useDropdown({
        items: OPTIONS,
        value: mode,
        onChange: (value) => setMode(value as ThemeMode),
    });
    const selected = OPTIONS.find((option) => option.value === mode) ?? OPTIONS[0];

    if (managedBy || paletteResolved(appearance.palette)) {
        return null;
    }

    return (
        <div ref={rootRef} className={cn('workspace-theme', className)}>
            <button
                {...triggerProps}
                aria-label={`切换主题：${selected.label}`}
                title={`主题：${selected.label}`}
                className="ui-glass workspace-icon-button workspace-theme-trigger"
                data-press-scale=""
            >
                <GlassMaterial />
                <Palette className="size-4" />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={reduced ? false : { opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={
                            reduced
                                ? { duration: 0 }
                                : { type: 'spring', duration: 0.42, bounce: 0.12 }
                        }
                        className="ui-glass ui-glass-menu workspace-theme-menu"
                    >
                        <GlassMaterial />
                        <ul {...listProps} aria-label="主题" className="workspace-theme-options">
                            <motion.li
                                aria-hidden="true"
                                role="presentation"
                                initial={false}
                                animate={{
                                    y: Math.max(0, activeIndex) * 44,
                                    opacity: activeIndex < 0 ? 0 : 1,
                                }}
                                transition={
                                    reduced
                                        ? { duration: 0 }
                                        : { type: 'spring', duration: 0.42, bounce: 0.12 }
                                }
                                className="workspace-theme-active"
                            />
                            {OPTIONS.map(({ value, label, icon: OptionIcon }, index) => (
                                <li
                                    key={value}
                                    {...getItemProps(index)}
                                    data-active={index === activeIndex}
                                    className="workspace-theme-option"
                                >
                                    <OptionIcon className="size-4" aria-hidden="true" />
                                    <span className="flex-1">{label}</span>
                                    {value === mode && (
                                        <Check className="size-4" aria-hidden="true" />
                                    )}
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
