import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { MotionConfig } from 'motion/react';
import { actionErrorMessage, useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useAutoPerformance } from '@/hooks/use-auto-performance';
import { performanceModeLow } from '@/lib/performance-mode';
import type { ThemeMode, UiAppearance, UiBackground } from '@/types';
import { DEFAULT_APPEARANCE } from '@nowluma/common/webui-appearance';
import { WEBUI_TARGETS, type WebuiPresentation } from '@nowluma/common/webui-target';
import { resolveAppearance } from '@/appearance/registry';
import {
    getTargetAppearance,
    presentationStore,
    subscribeHostAppearance,
} from '@/appearance/runtime';
import { paletteResolved } from '@/appearance/catalog';
import { applyAppearance, applyBackgroundLayer } from '@/appearance/dom';
import {
    fetchAppearance,
    persistAppearance,
    readCache,
    removeBackgroundImage,
    uploadBackgroundImage,
    writeCache,
} from '@/appearance/persistence';
import { runThemeReveal, trackRevealOrigin } from '@/appearance/reveal';

// Re-export the appearance surface so consumers keep importing it from the
// context module while each value has one owner under `@/appearance`.
export type {
    AccentMode,
    AccentScope,
    BackgroundType,
    DarkIntensity,
    Density,
    Palette,
    SidebarStyle,
    ThemeMode,
    TimeFormat,
    UiAppearance,
} from '@/types';
export { DEFAULT_APPEARANCE };
export type {
    AccentColor,
    AccentSpec,
    FontSpec,
    GradientSpec,
    PaletteSpec,
} from '@/appearance/catalog';
export {
    ACCENTS,
    FONT_CUSTOM_ID,
    FONT_MONO_OPTIONS,
    FONT_SANS_OPTIONS,
    GRADIENT_OPTIONS,
    PALETTE_OPTIONS,
    POLL_INTERVAL_OPTIONS,
    RADIUS_OPTIONS,
    UI_SCALE,
    paletteResolved,
} from '@/appearance/catalog';
export { accentVarsCss } from '@/appearance/color';

/** A partial appearance update; `background` may itself be a partial patch. */
export type AppearancePatch = Partial<Omit<UiAppearance, 'background'>> & {
    background?: Partial<UiBackground>;
};

// ─── Context ───────────────────────────────────────────────────────────────

interface ThemeContextValue {
    /** Effective presentation for components. Never persist this object. */
    appearance: UiAppearance;
    /** User preferences underneath the deployment overlay. Only these are persisted. */
    savedAppearance: UiAppearance;
    presentation: WebuiPresentation | null;
    managedBy: string | null;
    /** True once the first server load attempt has resolved. */
    ready: boolean;
    resolved: 'light' | 'dark';
    /** Merge a partial appearance: applies instantly, caches, debounced-persists. */
    setAppearance: (patch: AppearancePatch) => void;
    /** Upload a wallpaper (PNG/JPEG/WebP, ≤5MB). Throws on failure. */
    uploadBackground: (file: File) => Promise<void>;
    /** Remove the wallpaper. */
    removeBackground: () => Promise<void>;
    /** Format a timestamp per the configured 12h/24h preference. */
    formatClock: (input: string | number | Date) => string;
    /** Re-fetch appearance from the server (e.g. after login, so the authed
     *  `customCss` loads). */
    reloadAppearance: () => Promise<void>;
    // Common appearance controls.
    mode: ThemeMode;
    setMode: (m: ThemeMode) => void;
    pollInterval: number;
    performance: { mode: 'auto' | 'high' | 'low'; low: boolean; fps: number };
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') {
        return 'light';
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const { runAction, startAction } = useActionFeedback();
    const [appearance, setAppearanceState] = useState<UiAppearance>(readCache);
    const presentation = useSyncExternalStore(
        presentationStore.subscribe,
        presentationStore.getSnapshot,
    );
    const performanceMode = appearance.performanceMode ?? 'auto';
    const frameRate = useAutoPerformance(
        performanceMode === 'auto' && !appearance.disableMotion && !appearance.reduceMotion,
    );
    const lowPerformance = performanceModeLow(performanceMode, frameRate.autoLow);
    const effectiveAppearance = useMemo(
        () => resolveAppearance(appearance, presentation, getTargetAppearance()),
        [appearance, presentation],
    );
    const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);
    const [ready, setReady] = useState(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Mirror of the latest appearance so the (pure) setAppearance can read the
    // current value without an impure state-updater closure (StrictMode-safe).
    // Synced via a layout effect (not during render) + written synchronously by
    // the mutators themselves so consecutive calls in one tick still compose.
    const appearanceRef = useRef(appearance);

    // A Catppuccin flavor fixes light/dark; otherwise honor mode (+ system).
    const resolved: 'light' | 'dark' =
        paletteResolved(effectiveAppearance.palette) ??
        (effectiveAppearance.mode === 'system' ? systemTheme : effectiveAppearance.mode);

    useLayoutEffect(() => subscribeHostAppearance(window, presentationStore), []);

    // Track the OS theme for `mode: 'system'`.
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Load the server appearance, retaining the cache if it is unavailable.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const server = await fetchAppearance();

            if (cancelled) {
                return;
            }

            const next = server ?? readCache();

            setAppearanceState(next);
            writeCache(next);
            setReady(true);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    // Keep the mutator-facing ref in sync after any state change (init load,
    // system-theme flip, upload/delete). Written in an effect, never during render.
    useLayoutEffect(() => {
        appearanceRef.current = appearance;
    }, [appearance]);

    // Apply to the DOM before paint (useLayoutEffect) so the post-mount
    // application doesn't flash. The pre-mount flash is handled by the inline
    // bootstrap script in index.html.
    useLayoutEffect(() => {
        applyAppearance(effectiveAppearance, resolved, presentation, lowPerformance);
    }, [effectiveAppearance, resolved, presentation, lowPerformance]);
    useLayoutEffect(() => {
        applyBackgroundLayer(effectiveAppearance);
    }, [effectiveAppearance]);

    // Cancel a pending save when the provider unmounts.
    useEffect(
        () => () => {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
            }
        },
        [],
    );

    // Track the last click so the light/dark reveal can emanate from it.
    useEffect(trackRevealOrigin, []);

    const commit = useCallback(
        (patch: AppearancePatch) => {
            const prev = appearanceRef.current;
            const next: UiAppearance = {
                ...prev,
                ...patch,
                background: patch.background
                    ? { ...prev.background, ...patch.background }
                    : prev.background,
            };
            appearanceRef.current = next;
            setAppearanceState(next);
            writeCache(next);

            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
            }

            saveTimer.current = setTimeout(() => {
                saveTimer.current = null;
                void persistAppearance(next).catch((error) => {
                    console.error('persist appearance failed', error);
                    startAction({ title: '外观同步失败' }).fail(
                        `当前修改未保存：${actionErrorMessage(error)}`,
                    );
                });
            }, 400);
        },
        [startAction],
    );

    const setAppearance = useCallback(
        (patch: AppearancePatch) => {
            const prev = appearanceRef.current;
            // Animate a circular light/dark reveal only for brightness/scheme changes
            // (mode, palette, dark intensity) — and never when motion is reduced/off
            // or the device is on the low-performance budget.
            const schemeChange =
                (patch.mode !== undefined && patch.mode !== prev.mode) ||
                (patch.palette !== undefined && patch.palette !== prev.palette) ||
                (patch.darkIntensity !== undefined && patch.darkIntensity !== prev.darkIntensity);

            if (
                schemeChange &&
                !prev.reduceMotion &&
                !effectiveAppearance.disableMotion &&
                !lowPerformance
            ) {
                runThemeReveal(() => commit(patch));
            } else {
                commit(patch);
            }
        },
        [commit, effectiveAppearance.disableMotion, lowPerformance],
    );

    const uploadBackground = useMemo(
        () => async (file: File) =>
            runAction(
                {
                    title: '正在上传背景',
                    detail: file.name,
                    successTitle: '背景已更新',
                    successDetail: file.name,
                    errorTitle: '背景上传失败',
                },
                async () => {
                    const ap = await uploadBackgroundImage(file);

                    if (ap) {
                        appearanceRef.current = ap;
                        setAppearanceState(ap);
                        writeCache(ap);
                    }
                },
            ),
        [runAction],
    );

    const removeBackground = useMemo(
        () => async () =>
            runAction(
                {
                    title: '正在删除背景',
                    detail: '移除已上传的壁纸',
                    successTitle: '背景已删除',
                    successDetail: '已恢复为无壁纸状态',
                    errorTitle: '背景删除失败',
                },
                async () => {
                    const ap = await removeBackgroundImage();

                    if (ap) {
                        appearanceRef.current = ap;
                        setAppearanceState(ap);
                        writeCache(ap);
                    }
                },
            ),
        [runAction],
    );

    const formatClock = useMemo(
        () => (input: string | number | Date) => {
            const d = input instanceof Date ? input : new Date(input);

            if (Number.isNaN(d.getTime())) {
                return String(input);
            }

            return d.toLocaleTimeString(undefined, {
                hour12: appearance.timeFormat === '12h',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        },
        [appearance.timeFormat],
    );

    const reloadAppearance = useCallback(async () => {
        // Post-auth, the only field the pre-auth public subset lacked is
        // `customCss`. Merge JUST that (via setAppearance, which preserves every
        // other field — incl. a pre-auth localStorage migration — and write-through
        // persists). A full overwrite here would clobber that migration with the
        // server's not-yet-persisted default.
        const server = await fetchAppearance();

        if (server && server.customCss !== appearanceRef.current.customCss) {
            setAppearance({ customCss: server.customCss });
        }
    }, [setAppearance]);

    const value = useMemo<ThemeContextValue>(
        () => ({
            appearance: effectiveAppearance,
            savedAppearance: appearance,
            presentation,
            managedBy: presentation ? WEBUI_TARGETS[presentation.target].label : null,
            ready,
            resolved,
            setAppearance,
            uploadBackground,
            removeBackground,
            formatClock,
            reloadAppearance,
            mode: effectiveAppearance.mode,
            setMode: (m: ThemeMode) => setAppearance({ mode: m }),
            pollInterval: appearance.pollInterval,
            performance: {
                mode: performanceMode,
                low: lowPerformance,
                fps: frameRate.fps,
            },
        }),
        [
            appearance,
            effectiveAppearance,
            presentation,
            ready,
            resolved,
            setAppearance,
            uploadBackground,
            removeBackground,
            formatClock,
            reloadAppearance,
            performanceMode,
            lowPerformance,
            frameRate.fps,
        ],
    );

    return (
        <ThemeContext.Provider value={value}>
            <MotionConfig
                reducedMotion={
                    effectiveAppearance.reduceMotion || effectiveAppearance.disableMotion
                        ? 'always'
                        : 'user'
                }
            >
                {children}
            </MotionConfig>
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);

    if (!ctx) {
        throw new Error('useTheme must be used within ThemeProvider');
    }

    return ctx;
}
