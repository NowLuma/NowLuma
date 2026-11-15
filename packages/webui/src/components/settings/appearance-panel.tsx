import { useId, useState } from 'react';
import {
    Accessibility,
    Check,
    Monitor,
    Moon,
    MousePointer2,
    Palette,
    PanelTop,
    RotateCcw,
    Sun,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { TOPBAR_CATALOGUE } from '@/components/layout/top-bar';
import { BackgroundCard } from '@/components/settings/background-card';
import {
    Group,
    Segmented,
    SettingRow,
    SliderSettingRow,
    type Opt,
} from '@/components/settings/settings-controls';
import { Button } from '@/components/ui/button';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { reconcileLayoutItems, useLayout } from '@/contexts/LayoutContext';
import {
    ACCENTS,
    DEFAULT_APPEARANCE,
    FONT_CUSTOM_ID,
    FONT_MONO_OPTIONS,
    FONT_SANS_OPTIONS,
    PALETTE_OPTIONS,
    paletteResolved,
    RADIUS_OPTIONS,
    UI_SCALE,
    useTheme,
    type AccentScope,
    type DarkIntensity,
    type Density,
    type FontSpec,
    type SidebarStyle,
    type ThemeMode,
} from '@/contexts/ThemeContext';
import { useDesktopSidebar } from '@/hooks/use-media-query';
import { cn, toColorInputValue } from '@/lib/utils';

// ─────────────── 外观 ───────────────

const MODE_OPTIONS: Opt<ThemeMode>[] = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '跟随系统', icon: Monitor },
];

const DARK_INTENSITY_OPTIONS: Opt<DarkIntensity>[] = [
    { value: 'soft', label: '柔和' },
    { value: 'black', label: '纯黑 (OLED)' },
];

const SCOPE_OPTIONS: Opt<AccentScope>[] = [
    { value: 'global', label: '全局' },
    { value: 'sidebar', label: '仅侧栏' },
];

const SIDEBAR_STYLE_OPTIONS: Opt<SidebarStyle>[] = [
    { value: 'follow', label: '跟随背景' },
    { value: 'panel', label: '浅色面板' },
    { value: 'accent', label: '强调色' },
];

const DENSITY_OPTIONS: Opt<Density>[] = [
    { value: 'cozy', label: '舒适' },
    { value: 'compact', label: '紧凑' },
];

// ── a11y: one-time low-contrast advisory for a custom accent ──
// Pure-advisory per the plan: never blocks, never a persistent banner, and
// fires at most once per session (sessionStorage) so it can't nag.
const CONTRAST_WARNED_KEY = 'nowluma_contrast_warned';

function hexRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = hex.trim().replace('#', '');
    const h =
        m.length === 3
            ? m
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : m;

    if (h.length < 6) {
        return null;
    }

    const r = parseInt(h.slice(0, 2), 16),
        g = parseInt(h.slice(2, 4), 16),
        b = parseInt(h.slice(4, 6), 16);
    return Number.isNaN(r + g + b) ? null : { r, g, b };
}

function relLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
    const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two hex colours (1…21), or null if unparseable. */
function contrastRatio(a: string, b: string): number | null {
    const ra = hexRgb(a),
        rb = hexRgb(b);

    if (!ra || !rb) {
        return null;
    }

    const la = relLuminance(ra),
        lb = relLuminance(rb);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

// Top-bar element show/hide. Essential controls (menu, page title, logout) are
// not listed — they always render.
function TopbarPanel() {
    const { topbarItems, setTopbarItems } = useLayout();
    const reconciled = reconcileLayoutItems(
        topbarItems,
        TOPBAR_CATALOGUE.map((t) => t.id),
    );
    const shown = new Map(reconciled.map((i) => [i.id, i.visible]));
    const toggle = (id: string) =>
        setTopbarItems(reconciled.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)));
    return (
        <Group
            title="顶栏"
            icon={PanelTop}
            description="控制顶栏右侧元素的显示；菜单、页面标题与登出始终保留。"
        >
            {TOPBAR_CATALOGUE.map((t) => (
                <SettingRow key={t.id} label={t.label} layout="inline">
                    <ToggleSwitch
                        value={shown.get(t.id) ?? true}
                        onChange={() => toggle(t.id)}
                        ariaLabel={t.label}
                    />
                </SettingRow>
            ))}
        </Group>
    );
}

export function AppearancePanel() {
    const isDesktop = useDesktopSidebar();
    const {
        savedAppearance: appearance,
        setAppearance,
        uploadBackground,
        removeBackground,
        resolved,
        managedBy,
        performance: performanceStatus,
    } = useTheme();
    const a = appearance;
    // A Catppuccin flavor fixes its own light/dark + darkness, so the mode and
    // intensity controls are inert while one is active.
    const paletteFixed = paletteResolved(a.palette) !== null;

    // Low-contrast accent advisory (applies the change immediately, then — once
    // per session — offers to revert if the accent reads poorly on the canvas).
    const [contrastWarn, setContrastWarn] = useState<{ ratio: number } | null>(null);

    const pickCustomAccent = (hex: string) => {
        setAppearance({ accentMode: 'custom', accentCustom: hex });
        let warned = false;

        try {
            warned = sessionStorage.getItem(CONTRAST_WARNED_KEY) === '1';
        } catch {
            /* ignore */
        }

        if (warned) {
            return;
        }

        // Accent doubles as link/icon colour on the page background — flag UI-level
        // contrast below WCAG AA for large text / non-text (3:1).
        const bg = resolved === 'dark' ? '#0a0a0a' : '#ffffff';
        const ratio = contrastRatio(hex, bg);

        if (ratio !== null && ratio < 3) {
            try {
                sessionStorage.setItem(CONTRAST_WARNED_KEY, '1');
            } catch {
                /* ignore */
            }

            setContrastWarn({ ratio });
        }
    };

    return (
        <div className="flex flex-col gap-5">
            {managedBy && (
                <p className="text-sm leading-relaxed text-muted-foreground" role="status">
                    外观跟随{managedBy}
                    。原有配色、字体和背景已保留，退出集成后恢复；缩放与无障碍设置仍可调整。
                </p>
            )}
            <fieldset disabled={!!managedBy} className="contents" aria-label="主题、配色与背景">
                <Group
                    title="主题"
                    icon={Sun}
                    description={
                        managedBy
                            ? '下方显示已保留的个人设置；当前界面外观由宿主管理。'
                            : '配色方案、明暗模式与深色风格。所有改动立即生效并保存到服务器，跨设备同步。'
                    }
                >
                    <SettingRow
                        label="配色方案"
                        hint="“默认”跟随下方明暗模式；Catppuccin 为整套配色，会自行决定明暗。"
                        layout="stack"
                    >
                        <div
                            className="flex flex-wrap gap-2.5"
                            role="radiogroup"
                            aria-label="配色方案"
                        >
                            {PALETTE_OPTIONS.map((p) => {
                                const active = a.palette === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        aria-label={p.label}
                                        onClick={() => setAppearance({ palette: p.id })}
                                        className={cn(
                                            'flex w-[5.5rem] flex-col items-center gap-1.5 rounded-xl border p-1.5 transition-[border-color,box-shadow] duration-150 ease-out cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                                            active
                                                ? 'border-primary ring-2 ring-primary/30'
                                                : 'border-border hover:border-foreground/30',
                                        )}
                                    >
                                        <span
                                            className="flex h-11 w-full items-center justify-center rounded-lg"
                                            style={{ backgroundColor: p.preview.bg }}
                                        >
                                            <span
                                                className="flex gap-1 rounded-md px-1.5 py-1 shadow-sm"
                                                style={{ backgroundColor: p.preview.surface }}
                                            >
                                                {p.preview.dots.map((d, i) => (
                                                    <span
                                                        key={i}
                                                        className="size-1.5 rounded-full"
                                                        style={{ backgroundColor: d }}
                                                    />
                                                ))}
                                            </span>
                                        </span>
                                        <span className="text-xs font-medium">{p.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </SettingRow>
                    <SettingRow
                        label="显示模式"
                        hint={
                            managedBy
                                ? '明暗模式跟随宿主。'
                                : paletteFixed
                                  ? '当前由 Catppuccin 配色决定明暗。'
                                  : undefined
                        }
                    >
                        <Segmented
                            value={a.mode}
                            options={MODE_OPTIONS}
                            onChange={(mode) => setAppearance({ mode })}
                            disabled={paletteFixed}
                        />
                    </SettingRow>
                    <SettingRow
                        label="深色强度"
                        hint={
                            managedBy
                                ? '深色材质由宿主外观决定。'
                                : paletteFixed
                                  ? 'Catppuccin 配色自带明暗，无需调节。'
                                  : '“纯黑”将深色背景压到接近纯黑，适合 OLED 屏幕（仅深色模式下可见）。'
                        }
                        layout="stack"
                    >
                        <Segmented
                            value={a.darkIntensity}
                            options={DARK_INTENSITY_OPTIONS}
                            onChange={(darkIntensity) => setAppearance({ darkIntensity })}
                            disabled={paletteFixed}
                        />
                    </SettingRow>
                </Group>

                <Group
                    title="强调色"
                    icon={Palette}
                    description="按钮、链接与高亮使用的主色调；默认配色下，界面底色也会轻微跟随。"
                >
                    <SettingRow label="预设色" layout="stack">
                        <div className="flex flex-wrap items-center gap-2">
                            {ACCENTS.map((spec) => {
                                const active =
                                    a.accentMode === 'preset' && a.accentPreset === spec.id;
                                return (
                                    <button
                                        key={spec.id}
                                        type="button"
                                        onClick={() =>
                                            setAppearance({
                                                accentMode: 'preset',
                                                accentPreset: spec.id,
                                            })
                                        }
                                        title={spec.label}
                                        aria-label={spec.label}
                                        className={cn(
                                            'relative flex size-9 items-center justify-center rounded-full border transition-colors cursor-pointer',
                                            active
                                                ? 'border-foreground/30 ring-2 ring-primary'
                                                : 'border-border',
                                        )}
                                        style={{ backgroundColor: spec.swatch }}
                                    >
                                        {active && (
                                            <Check
                                                className="size-4 text-white drop-shadow-sm"
                                                strokeWidth={3}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                            <label
                                title="自定义颜色"
                                className={cn(
                                    'relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-colors',
                                    a.accentMode === 'custom'
                                        ? 'border-foreground/30 ring-2 ring-primary'
                                        : 'border-border',
                                )}
                                style={{
                                    background:
                                        a.accentMode === 'custom'
                                            ? a.accentCustom
                                            : 'conic-gradient(from 0deg, #f43f5e, #f59e0b, #10b981, #0ea5e9, #8b5cf6, #f43f5e)',
                                }}
                            >
                                <input
                                    type="color"
                                    value={toColorInputValue(a.accentCustom)}
                                    onChange={(e) => pickCustomAccent(e.target.value)}
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                    aria-label="自定义强调色"
                                />
                                {a.accentMode === 'custom' && (
                                    <Check
                                        className="pointer-events-none size-4 text-white drop-shadow-sm"
                                        strokeWidth={3}
                                    />
                                )}
                            </label>
                        </div>
                    </SettingRow>
                    <SettingRow
                        label="应用范围"
                        hint="“仅侧栏”时，主区域保持默认色，仅调整侧栏的底色与高亮。"
                    >
                        <Segmented
                            value={a.accentScope}
                            options={SCOPE_OPTIONS}
                            onChange={(accentScope) => setAppearance({ accentScope })}
                        />
                    </SettingRow>
                    <SettingRow label="侧栏样式">
                        <Segmented
                            value={a.sidebarStyle}
                            options={SIDEBAR_STYLE_OPTIONS}
                            onChange={(sidebarStyle) => setAppearance({ sidebarStyle })}
                        />
                    </SettingRow>
                </Group>

                <BackgroundCard
                    appearance={a}
                    setAppearance={setAppearance}
                    uploadBackground={uploadBackground}
                    removeBackground={removeBackground}
                />
            </fieldset>
            <Group title="排版与界面" icon={Palette} description="字体、圆角、缩放与密度。">
                <fieldset disabled={!!managedBy} className="contents" aria-label="字体与圆角">
                    <SettingRow label="界面字体" layout="stack">
                        <FontField
                            value={a.fontSans}
                            custom={a.fontSansCustom}
                            presets={FONT_SANS_OPTIONS}
                            onChange={(fontSans) => setAppearance({ fontSans })}
                            onCustomChange={(fontSansCustom) => setAppearance({ fontSansCustom })}
                            placeholder="例如：LXGW WenKai, PingFang SC"
                        />
                    </SettingRow>
                    <SettingRow label="等宽字体" hint="用于日志与代码。" layout="stack">
                        <FontField
                            value={a.fontMono}
                            custom={a.fontMonoCustom}
                            presets={FONT_MONO_OPTIONS}
                            onChange={(fontMono) => setAppearance({ fontMono })}
                            onCustomChange={(fontMonoCustom) => setAppearance({ fontMonoCustom })}
                            placeholder="例如：Cascadia Code, Sarasa Mono SC"
                        />
                    </SettingRow>
                    <SettingRow label="圆角">
                        <Segmented
                            value={a.radius}
                            options={RADIUS_OPTIONS.map((r) => ({
                                value: r.value,
                                label: r.label,
                            }))}
                            onChange={(radius) => setAppearance({ radius })}
                        />
                    </SettingRow>
                </fieldset>
                <SliderSettingRow
                    label="界面缩放"
                    hint="整体放大或缩小界面，适合高分屏或视力需要。"
                    min={UI_SCALE.min}
                    max={UI_SCALE.max}
                    step={UI_SCALE.step}
                    value={a.uiScale}
                    valueLabelFormat={(nextValue) => `${Math.round(nextValue * 100)}%`}
                    onValueChange={(uiScale) => setAppearance({ uiScale })}
                    aria-valuetext={`${Math.round(a.uiScale * 100)}%`}
                />
                <SettingRow label="显示密度">
                    <Segmented
                        value={a.density}
                        options={DENSITY_OPTIONS}
                        onChange={(density) => setAppearance({ density })}
                    />
                </SettingRow>
            </Group>

            <fieldset disabled={!!managedBy} className="contents" aria-label="主题变量">
                <ThemeVarsPanel
                    cssVars={a.cssVars}
                    onChange={(cssVars) => setAppearance({ cssVars })}
                />
            </fieldset>

            <TopbarPanel />

            <Group
                title="右键菜单"
                icon={MousePointer2}
                description="控制网页内右键操作的呈现方式。"
            >
                <SettingRow
                    label="自定义右键菜单"
                    hint="默认开启；关闭后立即恢复浏览器原生右键菜单。"
                    layout="inline"
                >
                    <ToggleSwitch
                        value={a.customContextMenu}
                        onChange={(customContextMenu) => setAppearance({ customContextMenu })}
                        ariaLabel="自定义右键菜单"
                    />
                </SettingRow>
            </Group>

            <Group
                title="交互与无障碍"
                icon={Accessibility}
                description="光标、动效、对比度与侧栏行为。"
            >
                <SettingRow
                    label="自定义光标"
                    hint="默认关闭；开启后使用主题化自适应光标。"
                    layout="inline"
                >
                    <ToggleSwitch
                        value={a.customPointerSystem}
                        disabled={!!managedBy}
                        onChange={(customPointerSystem) => setAppearance({ customPointerSystem })}
                        ariaLabel="自定义光标"
                    />
                </SettingRow>
                <SettingRow
                    label="性能模式"
                    hint="自动模式在前台持续低帧率时关闭动画和实时折射；本机检测结果不会影响其他设备。也可手动选择。"
                    layout="stack"
                >
                    <Segmented<'auto' | 'high' | 'low'>
                        value={a.performanceMode ?? 'auto'}
                        onChange={(performanceMode) => setAppearance({ performanceMode })}
                        options={[
                            { value: 'auto', label: '自动检测（默认）' },
                            { value: 'high', label: '完整效果' },
                            { value: 'low', label: '低性能 / 关闭动效' },
                        ]}
                    />
                    <p className="text-xs text-muted-foreground" role="status">
                        {performanceStatus?.low ? '当前已使用低性能效果' : '当前使用完整效果'}
                        {performanceStatus?.mode === 'auto' && performanceStatus.fps > 0
                            ? ` · 最近检测 ${Math.round(performanceStatus.fps)} FPS`
                            : ''}
                    </p>
                </SettingRow>
                <SettingRow
                    label="减弱动效"
                    hint="弱化页面切换、弹簧等装饰性动画（保留轻微淡入），对低端设备与晕动敏感者更友好。"
                    layout="inline"
                >
                    <ToggleSwitch
                        value={a.reduceMotion}
                        onChange={(reduceMotion) => setAppearance({ reduceMotion })}
                        ariaLabel="减弱动效"
                    />
                </SettingRow>
                <SettingRow
                    label="关闭全部动效"
                    hint="比“减弱动效”更彻底：移除所有界面动画，包括入场淡入与状态点闪烁。"
                    layout="inline"
                >
                    <ToggleSwitch
                        value={a.disableMotion}
                        onChange={(disableMotion) => setAppearance({ disableMotion })}
                        ariaLabel="关闭全部动效"
                    />
                </SettingRow>
                <SettingRow label="高对比模式" hint="加强边框与次要文字的对比度。" layout="inline">
                    <ToggleSwitch
                        value={a.highContrast}
                        onChange={(highContrast) => setAppearance({ highContrast })}
                        ariaLabel="高对比模式"
                    />
                </SettingRow>
                {isDesktop && (
                    <SettingRow
                        label="钉住侧栏展开"
                        hint="侧栏常驻展开，不再收成图标轨、也不随悬停自动收起。"
                        layout="inline"
                    >
                        <ToggleSwitch
                            value={a.sidebarPinned}
                            onChange={(sidebarPinned) => setAppearance({ sidebarPinned })}
                            ariaLabel="钉住侧栏展开"
                        />
                    </SettingRow>
                )}
            </Group>

            <ConfirmDialog
                open={contrastWarn !== null}
                onOpenChange={(o) => {
                    if (!o) {
                        setContrastWarn(null);
                    }
                }}
                title="强调色对比度较低"
                description={`所选强调色与背景的对比度约为 ${contrastWarn?.ratio.toFixed(1)}:1，低于推荐的 3:1，用作链接或图标时可能不易辨认。可以保留，或恢复默认强调色。`}
                confirmText="恢复默认色"
                cancelText="仍然使用"
                onConfirm={() =>
                    setAppearance({
                        accentMode: 'preset',
                        accentPreset: DEFAULT_APPEARANCE.accentPreset,
                        accentCustom: DEFAULT_APPEARANCE.accentCustom,
                    })
                }
            />
        </div>
    );
}

// A font selector: preset segments + a "自定义" segment that reveals a
// free-form family input. On Chromium (where `queryLocalFonts` exists) the
// input gets a native <datalist> populated with the user's installed fonts;
// everywhere else it stays a plain text box (feature-detect, silent fallback).
type LocalFont = { family: string };
type FontQueryWindow = Window & { queryLocalFonts?: () => Promise<LocalFont[]> };

function FontField({
    value,
    custom,
    presets,
    onChange,
    onCustomChange,
    placeholder,
}: {
    value: string;
    custom: string;
    presets: FontSpec[];
    onChange: (id: string) => void;
    onCustomChange: (family: string) => void;
    placeholder: string;
}) {
    const listId = useId();
    const [fonts, setFonts] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [fontLoadError, setFontLoadError] = useState<string | null>(null);
    const canQuery = typeof (window as FontQueryWindow).queryLocalFonts === 'function';
    const isCustom = value === FONT_CUSTOM_ID;

    const options: Opt<string>[] = [
        ...presets.map((f) => ({ value: f.id, label: f.label })),
        { value: FONT_CUSTOM_ID, label: '自定义' },
    ];

    // Lazily enumerate local fonts the first time the field is focused.
    const loadFonts = async () => {
        if (fonts !== null || loading || !canQuery) {
            return;
        }

        setLoading(true);
        setFontLoadError(null);

        try {
            const arr = await (window as FontQueryWindow).queryLocalFonts!();
            setFonts(
                Array.from(new Set(arr.map((f) => f.family))).sort((x, y) => x.localeCompare(y)),
            );
        } catch (error) {
            console.error('Failed to enumerate local fonts', error);
            setFontLoadError('无法读取本机字体，请检查浏览器权限后重试。');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <Segmented value={value} options={options} onChange={onChange} />
            {isCustom && (
                <div className="flex flex-col gap-1.5">
                    <input
                        type="text"
                        value={custom}
                        list={canQuery ? listId : undefined}
                        onChange={(e) => onCustomChange(e.target.value)}
                        onFocus={loadFonts}
                        placeholder={placeholder}
                        spellCheck={false}
                        autoComplete="off"
                        style={custom ? { fontFamily: custom } : undefined}
                        data-ui-control=""
                        className="w-full rounded-lg border bg-card/40 px-3 py-2 text-base outline-none focus:border-primary md:text-sm"
                    />
                    {canQuery && fonts && fonts.length > 0 && (
                        <datalist id={listId}>
                            {fonts.map((f) => (
                                <option key={f} value={f} />
                            ))}
                        </datalist>
                    )}
                    <SkeletonSwap
                        ready={!loading}
                        reserve={28}
                        lines={1}
                        label="本机字体"
                        className={!loading ? 'skeleton-swap-fluid' : ''}
                    >
                        {fontLoadError ? (
                            <div className="flex items-center gap-2 text-xs leading-snug text-destructive">
                                <span>{fontLoadError}</span>
                                <button
                                    type="button"
                                    className="shrink-0 font-medium underline underline-offset-2"
                                    onClick={() => void loadFonts()}
                                >
                                    重试
                                </button>
                            </div>
                        ) : (
                            <p className="text-xs leading-snug text-muted-foreground">
                                {canQuery
                                    ? '可输入字体名称，或聚焦后从已安装字体中选择；找不到时回退到系统字体。'
                                    : '输入已安装的字体名称（可写多个，用逗号分隔）；找不到时回退到系统字体。'}
                            </p>
                        )}
                    </SkeletonSwap>
                </div>
            )}
        </div>
    );
}

// Curated subset of the cssVars whitelist surfaced as colour pickers. The
// server accepts the full token set; this is just the operator-friendly view.
const CSS_VAR_FIELDS: { token: string; label: string }[] = [
    { token: '--background', label: '页面背景' },
    { token: '--foreground', label: '主文字' },
    { token: '--card', label: '卡片背景' },
    { token: '--primary', label: '主色调' },
    { token: '--muted-foreground', label: '次要文字' },
    { token: '--border', label: '边框' },
    { token: '--sidebar', label: '侧栏背景' },
    { token: '--destructive', label: '危险 / 错误' },
    { token: '--success', label: '成功' },
    { token: '--warning', label: '警告' },
];

// The variable panel: per-token colour overrides layered over the active
// palette/accent. Each override is a single hex value (validated server-side);
// an unset token falls through to the theme default.
function ThemeVarsPanel({
    cssVars,
    onChange,
}: {
    cssVars: Record<string, string>;
    onChange: (next: Record<string, string>) => void;
}) {
    const set = (token: string, hex: string) => onChange({ ...cssVars, [token]: hex });

    const clear = (token: string) => {
        const next = { ...cssVars };
        delete next[token];
        onChange(next);
    };

    const count = CSS_VAR_FIELDS.filter((f) => cssVars[f.token]).length;

    return (
        <Group
            title="主题微调"
            icon={Palette}
            description="逐个覆盖主题颜色变量，叠加在当前配色之上；未设置的保持配色默认值。登录页也会应用（安全：仅白名单变量与颜色值）。"
        >
            {CSS_VAR_FIELDS.map((f) => {
                const override = cssVars[f.token];
                return (
                    <SettingRow
                        key={f.token}
                        label={f.label}
                        hint={<code className="font-mono text-meta">{f.token}</code>}
                        layout="inline"
                    >
                        <div className="flex items-center gap-2.5">
                            {override ? (
                                <span className="font-mono text-meta text-muted-foreground tabular-nums">
                                    {override}
                                </span>
                            ) : (
                                <span className="text-meta text-muted-foreground">默认</span>
                            )}
                            <label
                                title="选择颜色"
                                className="relative size-7 cursor-pointer overflow-hidden rounded-md border"
                                style={
                                    override
                                        ? { backgroundColor: override }
                                        : {
                                              background:
                                                  'repeating-conic-gradient(#cbd5e1 0% 25%, #fff 0% 50%) 50% / 10px 10px',
                                          }
                                }
                            >
                                <input
                                    type="color"
                                    value={toColorInputValue(override || '#888888', '#888888')}
                                    onChange={(e) => set(f.token, e.target.value)}
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                    aria-label={`${f.label}颜色`}
                                />
                            </label>
                            <button
                                type="button"
                                onClick={() => clear(f.token)}
                                disabled={!override}
                                aria-label={`重置${f.label}`}
                                className="rounded-md p-1 text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 enabled:hover:text-destructive disabled:opacity-30"
                            >
                                <RotateCcw className="size-3.5" />
                            </button>
                        </div>
                    </SettingRow>
                );
            })}
            {count > 0 && (
                <div className="flex items-center justify-between gap-4 px-5 py-3">
                    <span className="text-meta text-muted-foreground">已覆盖 {count} 个变量</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onChange({})}
                        className="text-destructive hover:text-destructive"
                    >
                        <RotateCcw className="size-4" /> 全部恢复默认
                    </Button>
                </div>
            )}
        </Group>
    );
}
