// Full color-scheme palettes (surface/base token sets). Soft, complete palettes
// (Catppuccin, Rosé Pine, Nord, Everforest) mapped onto our token names. Accent
// (--primary/--ring) is intentionally left to the accent system so the two
// compose. Applied via the injected theme stylesheet over the base :root/.dark
// (see applyAppearance); darkIntensity is forced off for these (their darkness
// is part of the palette).
import type { Palette, UiAppearance } from '@/types';
import { LIGHT_PALETTES } from '@/appearance/catalog';

type PaletteVars = Record<string, string>;

interface PaletteInput {
    bg: string;
    fg: string;
    card: string;
    muted: string;
    mutedFg: string;
    accent: string;
    border: string;
    sidebar: string;
    sidebarAccent: string;
    destructive: string;
    destructiveFg: string;
    success: string;
    warning: string;
}

// Expand a palette's semantic colors into the full token set (all *-foreground
// surfaces share the palette text; popover=card, input/sidebar-border=border).
function pal(c: PaletteInput): PaletteVars {
    return {
        '--background': c.bg,
        '--foreground': c.fg,
        '--card': c.card,
        '--card-foreground': c.fg,
        '--popover': c.card,
        '--popover-foreground': c.fg,
        '--secondary': c.muted,
        '--secondary-foreground': c.fg,
        '--muted': c.muted,
        '--muted-foreground': c.mutedFg,
        '--accent': c.accent,
        '--accent-foreground': c.fg,
        '--destructive': c.destructive,
        '--destructive-foreground': c.destructiveFg,
        '--success': c.success,
        '--warning': c.warning,
        '--border': c.border,
        '--input': c.border,
        '--sidebar': c.sidebar,
        '--sidebar-foreground': c.fg,
        '--sidebar-accent': c.sidebarAccent,
        '--sidebar-accent-foreground': c.fg,
        '--sidebar-border': c.border,
    };
}

const PALETTES: Record<Exclude<Palette, 'default'>, PaletteVars> = {
    'catppuccin-latte': pal({
        bg: '#eff1f5',
        fg: '#4c4f69',
        card: '#ffffff',
        muted: '#e6e9ef',
        mutedFg: '#6c6f85',
        accent: '#dce0e8',
        border: '#ccd0da',
        sidebar: '#e6e9ef',
        sidebarAccent: '#dce0e8',
        destructive: '#d20f39',
        destructiveFg: '#ffffff',
        success: '#40a02b',
        warning: '#df8e1d',
    }),
    'catppuccin-frappe': pal({
        bg: '#303446',
        fg: '#c6d0f5',
        card: '#414559',
        muted: '#414559',
        mutedFg: '#a5adce',
        accent: '#51576d',
        border: '#51576d',
        sidebar: '#292c3c',
        sidebarAccent: '#414559',
        destructive: '#e78284',
        destructiveFg: '#232634',
        success: '#a6d189',
        warning: '#e5c890',
    }),
    'catppuccin-macchiato': pal({
        bg: '#24273a',
        fg: '#cad3f5',
        card: '#363a4f',
        muted: '#363a4f',
        mutedFg: '#a5adcb',
        accent: '#494d64',
        border: '#494d64',
        sidebar: '#1e2030',
        sidebarAccent: '#363a4f',
        destructive: '#ed8796',
        destructiveFg: '#181926',
        success: '#a6da95',
        warning: '#eed49f',
    }),
    'catppuccin-mocha': pal({
        bg: '#1e1e2e',
        fg: '#cdd6f4',
        card: '#313244',
        muted: '#313244',
        mutedFg: '#a6adc8',
        accent: '#45475a',
        border: '#45475a',
        sidebar: '#181825',
        sidebarAccent: '#313244',
        destructive: '#f38ba8',
        destructiveFg: '#11111b',
        success: '#a6e3a1',
        warning: '#f9e2af',
    }),
    // Rosé Pine — soft rosy/iris dark, plus the lighter Moon and the light Dawn.
    'rose-pine': pal({
        bg: '#191724',
        fg: '#e0def4',
        card: '#1f1d2e',
        muted: '#26233a',
        mutedFg: '#908caa',
        accent: '#403d52',
        border: '#403d52',
        sidebar: '#1f1d2e',
        sidebarAccent: '#26233a',
        destructive: '#eb6f92',
        destructiveFg: '#191724',
        success: '#9ccfd8',
        warning: '#f6c177',
    }),
    'rose-pine-moon': pal({
        bg: '#232136',
        fg: '#e0def4',
        card: '#2a273f',
        muted: '#393552',
        mutedFg: '#908caa',
        accent: '#44415a',
        border: '#44415a',
        sidebar: '#2a273f',
        sidebarAccent: '#393552',
        destructive: '#eb6f92',
        destructiveFg: '#232136',
        success: '#9ccfd8',
        warning: '#f6c177',
    }),
    'rose-pine-dawn': pal({
        bg: '#faf4ed',
        fg: '#575279',
        card: '#fffaf3',
        muted: '#f2e9e1',
        mutedFg: '#797593',
        accent: '#dfdad9',
        border: '#dfdad9',
        sidebar: '#f2e9e1',
        sidebarAccent: '#dfdad9',
        destructive: '#b4637a',
        destructiveFg: '#faf4ed',
        success: '#286983',
        warning: '#ea9d34',
    }),
    // Nord — cool arctic dark.
    nord: pal({
        bg: '#2e3440',
        fg: '#e5e9f0',
        card: '#3b4252',
        muted: '#3b4252',
        mutedFg: '#9aa1b2',
        accent: '#434c5e',
        border: '#434c5e',
        sidebar: '#2b303b',
        sidebarAccent: '#434c5e',
        destructive: '#bf616a',
        destructiveFg: '#eceff4',
        success: '#a3be8c',
        warning: '#ebcb8b',
    }),
    // Everforest — soft warm green, dark + light.
    'everforest-dark': pal({
        bg: '#2d353b',
        fg: '#d3c6aa',
        card: '#343f44',
        muted: '#343f44',
        mutedFg: '#9da9a0',
        accent: '#3d484d',
        border: '#475258',
        sidebar: '#232a2e',
        sidebarAccent: '#3d484d',
        destructive: '#e67e80',
        destructiveFg: '#2d353b',
        success: '#a7c080',
        warning: '#dbbc7f',
    }),
    'everforest-light': pal({
        bg: '#efebd4',
        fg: '#5c6a72',
        card: '#fdf6e3',
        muted: '#e6e2cc',
        mutedFg: '#829181',
        accent: '#e0dcc7',
        border: '#e0dcc7',
        sidebar: '#f4f0d9',
        sidebarAccent: '#e6e2cc',
        destructive: '#f85552',
        destructiveFg: '#fdf6e3',
        success: '#8da101',
        warning: '#dfa000',
    }),
};

export function paletteVarsCss(a: UiAppearance): string {
    if (a.palette === 'default') {
        return '';
    }

    const vars = PALETTES[a.palette];

    if (!vars) {
        return '';
    }

    const body = Object.entries(vars)
        .map(([k, v]) => `${k}:${v};`)
        .join('');
    // Light palette → :root; dark → .dark (resolved is forced to match in the
    // provider, so the selector always matches the active scheme).
    const selector = LIGHT_PALETTES.has(a.palette) ? ':root' : '.dark';
    return `${selector}{${body}}`;
}
