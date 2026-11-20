import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { ArrowRight, Layers, Sparkles } from 'lucide-react';
import { Segmented, SettingRow } from '@/components/settings/settings-controls';
import { useWizardNavigation } from '@/components/interior/wizard-steps';
import { Button } from '@/components/ui/button';
import { GlassSurface } from '@/components/ui/glass-material';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { actionErrorMessage, useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useTheme } from '@/contexts/ThemeContext';
import { authToken } from '@/appearance/persistence';
import type { PerformanceMode } from '@/lib/performance-mode';

interface DisplayEffectsChoices {
    disableMotion: boolean | null;
    performanceMode: PerformanceMode | null;
}

type DisplayEffectsPatch = Partial<{
    disableMotion: boolean;
    performanceMode: PerformanceMode;
}>;

/** One set of controls and one appearance owner for Settings and first setup. */
export function DisplayEffectsControls({
    value,
    onChange,
    requireExplicit = false,
    disabled = false,
}: {
    value: DisplayEffectsChoices;
    onChange: (patch: DisplayEffectsPatch) => void;
    requireExplicit?: boolean;
    disabled?: boolean;
}) {
    return (
        <>
            <SettingRow
                label="动效"
                hint="由你手动开启或关闭；关闭后仍保留静态玻璃。系统与无障碍设置仍可减弱动画。"
                layout={requireExplicit ? 'auto' : 'inline'}
            >
                {requireExplicit ? (
                    <Segmented<'on' | 'off' | ''>
                        value={value.disableMotion === null ? '' : value.disableMotion ? 'off' : 'on'}
                        options={[
                            { value: 'on', label: '开启' },
                            { value: 'off', label: '关闭' },
                        ]}
                        onChange={(choice) => {
                            if (choice) {
                                onChange({ disableMotion: choice === 'off' });
                            }
                        }}
                        disabled={disabled}
                    />
                ) : (
                    <div className="flex min-h-11 items-center gap-3">
                        <span aria-hidden="true" className="text-xs text-muted-foreground">
                            {value.disableMotion ? '关闭' : '开启'}
                        </span>
                        <ToggleSwitch
                            value={!value.disableMotion}
                            onChange={(enabled) => onChange({ disableMotion: !enabled })}
                            ariaLabel="动效"
                            disabled={disabled}
                        />
                    </div>
                )}
            </SettingRow>
            <SettingRow
                label="玻璃材质"
                hint="完整玻璃提供背景折射；磨砂玻璃减少渲染开销。不会自动切换，也不会改变动效开关。"
            >
                <Segmented<PerformanceMode | ''>
                    value={value.performanceMode ?? ''}
                    options={[
                        { value: 'high', label: '完整玻璃' },
                        { value: 'low', label: '磨砂玻璃' },
                    ]}
                    onChange={(performanceMode) => {
                        if (performanceMode) {
                            onChange({ performanceMode });
                        }
                    }}
                    disabled={disabled}
                />
            </SettingRow>
            <DisplayEffectsPreview />
        </>
    );
}

function DisplayEffectsPreview() {
    const { appearance, performance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const [active, setActive] = useState(false);

    return (
        <figure
            aria-label="显示效果预览"
            className="relative my-3 overflow-hidden rounded-[4px] border border-border bg-card p-5 sm:p-6"
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-35"
                style={{
                    backgroundImage: 'radial-gradient(circle, var(--border) 0.75px, transparent 0.75px)',
                    backgroundSize: '28px 28px',
                }}
            />
            <div className="relative">
                <p className="text-xs text-muted-foreground">今日工作区</p>
                <p className="mt-2 text-sm font-medium">安静的纸面，清晰的内容。</p>
                <div className="mt-5 flex min-h-14 flex-wrap items-center gap-4">
                    <Button
                        type="button"
                        variant="glass"
                        className="min-h-11"
                        aria-pressed={active}
                        onClick={() => setActive((current) => !current)}
                    >
                        <Sparkles aria-hidden="true" className="size-4" />
                        试试动效
                    </Button>
                    <motion.div
                        animate={{ x: !reduced && active ? 16 : 0 }}
                        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 28 }}
                    >
                        <GlassSurface className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs">
                            <Layers aria-hidden="true" className="size-4" />
                            <span>导航与短操作</span>
                        </GlassSurface>
                    </motion.div>
                </div>
                <figcaption className="mt-4 text-xs leading-relaxed text-muted-foreground" role="status">
                    材质选择：{performance.low ? '磨砂玻璃' : '完整玻璃'}
                    {' · '}动效：{appearance.disableMotion ? '关闭' : '开启'}
                    {!appearance.disableMotion && reduced ? '（系统或无障碍设置已减弱）' : ''}
                </figcaption>
            </div>
        </figure>
    );
}

export function DisplayEffectsOnboardingStep({ replay }: { replay: boolean }) {
    const { next } = useWizardNavigation();
    const { ready, saveAppearance, setAppearancePreview } = useTheme();
    const { runAction } = useActionFeedback();
    const [choices, setChoices] = useState<DisplayEffectsChoices>({
        disableMotion: null,
        performanceMode: null,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(false);
    const saving = useRef(false);

    useLayoutEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const choose = (patch: DisplayEffectsPatch) => {
        if (saving.current) {
            return;
        }
        setChoices((current) => ({ ...current, ...patch }));
        setAppearancePreview(patch);
        setError(null);
    };

    const advance = async () => {
        if (saving.current || choices.disableMotion === null || choices.performanceMode === null) {
            return;
        }
        const { disableMotion, performanceMode } = choices;
        if (replay) {
            next();
            return;
        }
        const token = authToken();
        if (!token) {
            setError('登录已失效，请重新登录后保存显示效果。');
            return;
        }
        saving.current = true;
        setSubmitting(true);
        setError(null);
        try {
            await runAction(
                {
                    title: '正在保存显示效果',
                    successTitle: '显示效果已保存',
                    errorTitle: '显示效果保存失败',
                },
                () => saveAppearance({
                    disableMotion,
                    performanceMode,
                }),
            );
            if (!mounted.current) {
                return;
            }
            if (authToken() !== token) {
                setError('登录状态已变化，请重新登录后保存显示效果。');
                return;
            }
            next();
        } catch (caught) {
            if (mounted.current) {
                setError(actionErrorMessage(caught));
            }
        } finally {
            saving.current = false;
            if (mounted.current) {
                setSubmitting(false);
            }
        }
    };

    return (
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-5 py-2 sm:py-5">
            <header>
                <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">显示效果</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    分别选择动效与玻璃材质，再继续设置。以后可在设置 → 外观中调整。
                </p>
            </header>
            {replay && (
                <p role="status" className="text-xs leading-relaxed text-muted-foreground">
                    开发者演练：只预览显示效果，不保存外观、密码或协议确认；退出后恢复原来的显示设置。
                </p>
            )}
            <div className="divide-y divide-border/60">
                <DisplayEffectsControls
                    value={choices}
                    onChange={choose}
                    requireExplicit
                    disabled={submitting}
                />
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <div className="workspace-onboarding-actions mt-auto flex justify-end pt-3">
                <Button
                    type="button"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={submitting || (!replay && !ready) || choices.disableMotion === null || choices.performanceMode === null}
                    onClick={() => { void advance(); }}
                >
                    {submitting ? '保存中…' : replay ? '应用预览并继续' : '保存并继续'}
                    <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
            </div>
        </div>
    );
}
