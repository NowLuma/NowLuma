import { useId, useState } from 'react';
import {
    Accessibility,
    Check,
    Monitor,
    Layers,
    Moon,
    Palette,
    PanelTop,
    RotateCcw,
    Sun,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { TOPBAR_CATALOGUE } from '@/components/layout/top-bar';
import { BackgroundCard } from '@/components/settings/background-card';
import { DisplayEffectsControls } from '@/components/display-effects';
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
    { value: 'sidebar', label: '仅导航' },
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

// Optional tools in the top bar and more-actions menu retain their saved visibility.
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
            title="顶栏工具"
            icon={PanelTop}
            description="工作区管理与更多操作入口始终保留。"
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
        <div className="flex min-w-0 flex-col gap-7">
            {managedBy && (
                <p className="text-sm leading-relaxed text-muted-foreground" role="status">
                    外观由{managedBy}管理；个人配色、字体与背景已保留。动效、材质、缩放和无障碍仍可调整。
                </p>
            )}
            <fieldset disabled={!!managedBy} className="contents" aria-label="主题、配色与背景">
                <Group
                    title="主题"
                    icon={Sun}
                    description={managedBy ? '以下为已保留的个人设置。' : '改动立即应用并同步到服务器。'}
                >
                    <SettingRow
                        label="配色方案"
                        hint="默认配色跟随显示模式；Catppuccin 自带明暗。"
                        layout="stack"
                    >
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="配色方案">
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
                                            'inline-flex min-h-11 items-center gap-2 rounded-[4px] border px-3 text-xs font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            active ? 'border-foreground' : 'border-border hover:bg-muted/40',
                                        )}
                                    >
                                        <span aria-hidden="true" className="flex overflow-hidden rounded-[2px] border border-border/60">
                                            <span className="size-3.5" style={{ backgroundColor: p.preview.bg }} />
                                            <span className="size-3.5" style={{ backgroundColor: p.preview.surface }} />
                                            {p.preview.dots.map((color, i) => (
                                                <span key={i} className="size-3.5" style={{ backgroundColor: color }} />
                                            ))}
                                        </span>
                                        <span>{p.label}</span>
                                        <span aria-hidden="true" className="size-3.5">
                                            {active && <Check className="size-3.5" />}
                                        </span>
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
                                  : '纯黑用于 OLED，仅在深色模式下可见。'
                        }
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
                    description="按钮、链接与高亮的颜色。"
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
                                        aria-pressed={active}
                                        onClick={() =>
                                            setAppearance({
                                                accentMode: 'preset',
                                                accentPreset: spec.id,
                                            })
                                        }
                                        title={spec.label}
                                        aria-label={spec.label}
                                        className={cn(
                                            'inline-flex min-h-11 items-center gap-2 rounded-[4px] border px-3 text-xs transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            active ? 'border-foreground' : 'border-border hover:bg-muted/40',
                                        )}
                                    >
                                        <span aria-hidden="true" className="size-4 rounded-[2px] border border-border/60" style={{ backgroundColor: spec.swatch }} />
                                        <span>{spec.label}</span>
                                        <span aria-hidden="true" className="size-3.5">
                                            {active && <Check className="size-3.5" />}
                                        </span>
                                    </button>
                                );
                            })}
                            <label
                                title="自定义颜色"
                                className={cn(
                                    'relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[4px] border px-3 text-xs focus-within:ring-2 focus-within:ring-ring',
                                    a.accentMode === 'custom' ? 'border-foreground' : 'border-border',
                                )}
                            >
                                <input
                                    type="color"
                                    value={toColorInputValue(a.accentCustom)}
                                    onChange={(e) => pickCustomAccent(e.target.value)}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    aria-label="自定义强调色"
                                />
                                <span aria-hidden="true" className="size-4 rounded-[2px] border border-border/60" style={{ backgroundColor: a.accentCustom }} />
                                <span>自定义</span>
                                <span aria-hidden="true" className="size-3.5">
                                    {a.accentMode === 'custom' && <Check className="size-3.5" />}
                                </span>
                            </label>
                        </div>
                    </SettingRow>
                    <SettingRow label="应用范围" hint="“仅导航”时，主区域保持默认色。">
                        <Segmented
                            value={a.accentScope}
                            options={SCOPE_OPTIONS}
                            onChange={(accentScope) => setAppearance({ accentScope })}
                        />
                    </SettingRow>
                    <SettingRow label="导航样式">
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
            <Group title="排版与界面" icon={Palette}>
                <fieldset disabled={!!managedBy} className="contents" aria-label="字体与圆角">
                    <SettingRow label="界面字体" layout="stack">
                        <FontField
                            label="界面字体"
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
                            label="等宽字体"
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
                    hint="整体缩放界面。"
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

            <details>
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    主题颜色变量
                </summary>
            <fieldset disabled={!!managedBy} className="contents" aria-label="主题变量">
                <ThemeVarsPanel
                    cssVars={a.cssVars}
                    onChange={(cssVars) => setAppearance({ cssVars })}
                />
            </fieldset>
            </details>

            <TopbarPanel />
            <Group
                title="显示效果"
                icon={Layers}
                description="手动选择动效与材质。改动立即应用，并通过同一外观设置同步保存。"
            >
                <DisplayEffectsControls
                    value={{ disableMotion: a.disableMotion, performanceMode: a.performanceMode ?? 'high' }}
                    onChange={setAppearance}
                />
            </Group>

            <Group
                title="交互与无障碍"
                icon={Accessibility}
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
                <SettingRow
                    label="自定义光标"
                    hint="使用主题化自适应光标。"
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
                    label="减弱动效"
                    hint="减少位移与弹簧，保留轻微淡入。"
                    layout="inline"
                >
                    <ToggleSwitch
                        value={a.reduceMotion}
                        onChange={(reduceMotion) => setAppearance({ reduceMotion })}
                        ariaLabel="减弱动效"
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
                        label="显示导航说明"
                        hint="在宽屏导航中显示页面用途。"
                        layout="inline"
                    >
                        <ToggleSwitch
                            value={a.sidebarPinned}
                            onChange={(sidebarPinned) => setAppearance({ sidebarPinned })}
                            ariaLabel="显示导航说明"
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
    label,
    value,
    custom,
    presets,
    onChange,
    onCustomChange,
    placeholder,
}: {
    label: string;
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
                        aria-label={`自定义${label}`}
                        value={custom}
                        list={canQuery ? listId : undefined}
                        onChange={(e) => onCustomChange(e.target.value)}
                        onFocus={loadFonts}
                        placeholder={placeholder}
                        spellCheck={false}
                        autoComplete="off"
                        style={custom ? { fontFamily: custom } : undefined}
                        data-ui-control=""
                        className="min-h-11 w-full rounded-[4px] border bg-transparent px-3 py-2 text-base outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
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
                            <div role="alert" className="flex flex-wrap items-center gap-2 text-xs leading-snug text-destructive">
                                <span>{fontLoadError}</span>
                                <button
                                    type="button"
                                    className="min-h-11 shrink-0 px-2 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => void loadFonts()}
                                >
                                    重试
                                </button>
                            </div>
                        ) : (
                            <p className="text-xs leading-snug text-muted-foreground">
                                {canQuery
                                    ? '可选择本机字体或输入名称；未安装时使用系统字体。'
                                    : '可输入多个已安装字体，用逗号分隔；未安装时使用系统字体。'}
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
    { token: '--sidebar', label: '导航背景' },
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
            title="颜色覆盖"
            icon={Palette}
            description="覆盖当前配色；未设置的沿用默认值。白名单颜色变量也应用于登录页。"
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
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {override ? (
                                <span className="font-mono text-meta text-muted-foreground tabular-nums">
                                    {override}
                                </span>
                            ) : (
                                <span className="text-meta text-muted-foreground">默认</span>
                            )}
                            <label
                                title="选择颜色"
                                className="relative size-11 cursor-pointer overflow-hidden rounded-[4px] border bg-muted/40 focus-within:ring-2 focus-within:ring-ring"
                                style={override ? { backgroundColor: override } : undefined}
                            >
                                <input
                                    type="color"
                                    value={toColorInputValue(override || '#888888', '#888888')}
                                    onChange={(e) => set(f.token, e.target.value)}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    aria-label={`${f.label}颜色`}
                                />
                            </label>
                            <button
                                type="button"
                                onClick={() => clear(f.token)}
                                disabled={!override}
                                aria-label={`重置${f.label}`}
                                className="flex size-11 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:text-destructive disabled:opacity-30"
                            >
                                <RotateCcw className="size-3.5" />
                            </button>
                        </div>
                    </SettingRow>
                );
            })}
            {count > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 py-3">
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
