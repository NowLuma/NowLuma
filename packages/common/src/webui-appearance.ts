// Browser-safe appearance contract shared by the WebUI server schema and the
// React client. This module must stay free of Node imports so the browser
// bundle can import the defaults and cache key directly.
//
// The JSON shape is the persisted `config/ui.json` appearance section: the
// server (`core/src/webui/ui-config.ts`) owns normalization/storage, and this
// file owns the shared types + the single set of defaults. Layout/pages
// preferences deliberately stay out of this contract.

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentMode = 'preset' | 'custom';
export type AccentScope = 'sidebar' | 'global';
export type DarkIntensity = 'soft' | 'black';
export type SidebarStyle = 'follow' | 'panel' | 'accent';
export type BackgroundType = 'none' | 'solid' | 'gradient' | 'image';
export type Density = 'cozy' | 'compact';
export type TimeFormat = '12h' | '24h';
/** Full color scheme. 'default' keeps the neutral base (driven by `mode`); the
 *  Catppuccin flavors are complete palettes that also fix light/dark. */
export type Palette =
    | 'default'
    | 'catppuccin-latte'
    | 'catppuccin-frappe'
    | 'catppuccin-macchiato'
    | 'catppuccin-mocha'
    | 'rose-pine'
    | 'rose-pine-moon'
    | 'rose-pine-dawn'
    | 'nord'
    | 'everforest-dark'
    | 'everforest-light';

export interface UiBackground {
    type: BackgroundType;
    /** Solid-fill colour (hex). Used when type === 'solid'. */
    color: string;
    /** Gradient preset id (frontend owns the catalogue). Used when type === 'gradient'. */
    gradient: string;
    /** Image readability overlay: 0 (image fully visible) … 1 (fully masked). */
    imageOpacity: number;
    /** Image blur in px (0…40). */
    imageBlur: number;
    // ── server-managed (upload/delete endpoints only) ──
    hasImage: boolean;
    imageMime: string;
    /** Bumped on each successful upload so the browser can cache-bust. */
    imageVersion: number;
}

export interface UiAppearance {
    mode: ThemeMode;
    accentMode: AccentMode;
    /** Preset accent id (frontend catalogue: neutral/sky/blue/violet/…). */
    accentPreset: string;
    /** Custom accent colour (hex). Used when accentMode === 'custom'. */
    accentCustom: string;
    accentScope: AccentScope;
    darkIntensity: DarkIntensity;
    /** Full color scheme; 'default' = the built-in neutral theme. */
    palette: Palette;
    sidebarStyle: SidebarStyle;
    background: UiBackground;
    /** Sans font preset id (frontend catalogue); 'custom' uses `fontSansCustom`. */
    fontSans: string;
    /** Free-form sans font-family stack, used when `fontSans === 'custom'`. */
    fontSansCustom: string;
    /** Mono font preset id (frontend catalogue); 'custom' uses `fontMonoCustom`. */
    fontMono: string;
    /** Free-form mono font-family stack, used when `fontMono === 'custom'`. */
    fontMonoCustom: string;
    /** Global UI scale, 0.9…1.2. */
    uiScale: number;
    /** Corner radius in rem, 0…2. */
    radius: number;
    density: Density;
    /** Soften animations (transforms off, shorter durations). */
    reduceMotion: boolean;
    /** Manual motion switch: false enables effects; true disables all animations. */
    disableMotion: boolean;
    /** Manual glass quality; legacy stored `auto` normalizes to `high`. */
    performanceMode?: 'high' | 'low';
    /** Use Nowluma's adaptive cursor. */
    customPointerSystem: boolean;
    /** Replace the browser context menu with Nowluma's context menu. */
    customContextMenu: boolean;
    highContrast: boolean;
    sidebarPinned: boolean;
    timeFormat: TimeFormat;
    /** Dashboard poll interval (ms); 0 = paused. */
    pollInterval: number;
    /**
     * Operator custom CSS, applied AFTER auth only (never on the login page —
     * `publicAppearance` strips it). Capped at 50 KB. The client injects it as
     * the last <style> and skips it under `?safe-mode=1` so a broken rule can't
     * lock the operator out.
     */
    customCss: string;
    /**
     * Theme-token overrides from the variable panel. Keys are restricted to a
     * fixed whitelist of `--token` names and values to colours / lengths, so
     * (unlike `customCss`) this is safe to serve to the unauthenticated login
     * page — the server drops unknown keys and invalid values.
     */
    cssVars: Record<string, string>;
}

/** localStorage key for the first-paint appearance cache. The prepaint script
 *  in `index.html` reads the same literal; keep both in sync. */
export const UI_APPEARANCE_CACHE_KEY = 'nowluma_ui_appearance';

export const DEFAULT_BACKGROUND: UiBackground = {
    type: 'none',
    color: '#ffffff',
    gradient: 'none',
    imageOpacity: 0.15,
    imageBlur: 0,
    hasImage: false,
    imageMime: '',
    imageVersion: 0,
};

/** Neutral white/light base with a white dark-mode primary. Purple accents stay
 *  selectable in the frontend catalogue; saved preferences override these. */
export const DEFAULT_APPEARANCE: UiAppearance = {
    mode: 'system',
    accentMode: 'preset',
    accentPreset: 'neutral',
    accentCustom: '#111111',
    accentScope: 'global',
    darkIntensity: 'soft',
    palette: 'default',
    sidebarStyle: 'follow',
    background: DEFAULT_BACKGROUND,
    fontSans: 'default',
    fontSansCustom: '',
    fontMono: 'default',
    fontMonoCustom: '',
    uiScale: 1,
    radius: 0.25,
    density: 'cozy',
    reduceMotion: false,
    disableMotion: false,
    performanceMode: 'high',
    customPointerSystem: false,
    customContextMenu: true,
    highContrast: false,
    sidebarPinned: false,
    timeFormat: '24h',
    pollInterval: 3000,
    customCss: '',
    cssVars: {},
};
